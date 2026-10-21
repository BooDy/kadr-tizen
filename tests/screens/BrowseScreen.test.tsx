import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { BrowseScreen } from '../../src/screens/BrowseScreen';
import { ApiClient } from '../../src/api/client';
import * as screensApi from '../../src/api/screens';
import { ScreenLayout } from '../../src/types/ast';
import { TVKeys } from '../../src/navigation/keys';

describe('BrowseScreen', () => {
  let mockClient: ApiClient;

  const mockHomeLayout: ScreenLayout = {
    id: 'home',
    title: 'Home',
    widgets: [
      {
        id: 'hero-home',
        type: 'hero_banner',
        data: {
          id: 101,
          title: 'Home Featured Movie',
          subtitle: 'Featured movie subtitle',
          backdrop_url: '/backdrop.jpg',
          media_type: 'movie',
        },
      },
      {
        id: 'carousel-home',
        type: 'carousel',
        title: 'Popular Right Now',
        items: [
          {
            id: 201,
            title: 'Top TV Show',
            media_type: 'series',
          },
        ],
      },
    ],
  };

  const mockMoviesLayout: ScreenLayout = {
    id: 'movies',
    title: 'Movies',
    widgets: [
      {
        id: 'grid-movies',
        type: 'grid',
        title: 'Feature Films',
        columns: 6,
        items: [
          { id: 10, title: 'Interstellar', media_type: 'movie' },
          { id: 11, title: 'Inception', media_type: 'movie' },
          { id: 12, title: 'The Prestige', media_type: 'movie' },
          { id: 13, title: 'Memento', media_type: 'movie' },
          { id: 14, title: 'Oppenheimer', media_type: 'movie' },
          { id: 15, title: 'Dunkirk', media_type: 'movie' },
          { id: 16, title: 'Tenet', media_type: 'movie' },
        ],
      },
    ],
  };

  const mockShowsLayout: ScreenLayout = {
    id: 'shows',
    title: 'Shows',
    widgets: [
      {
        id: 'grid-shows',
        type: 'grid',
        title: 'All TV Series',
        columns: 6,
        items: [
          {
            id: 20,
            title: 'Better Call Saul',
            media_type: 'series',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockClient = new ApiClient('http://localhost:8492');
    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'Shows' },
    ]);
  });

  it('loads dynamic screens from server and renders custom library tabs in sidebar', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'TV Shows' },
      { id: 'anime', title: 'Anime' },
    ];

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue({
      id: 'home',
      title: 'Home',
      widgets: [],
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
      expect(screen.getByText('Anime')).toBeInTheDocument();
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('TV Shows')).toBeInTheDocument();
  });

  it('switches to custom screen on Enter and loads its layout', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'anime', title: 'Anime' },
    ];
    const mockAnimeLayout: ScreenLayout = {
      id: 'anime',
      title: 'Anime',
      widgets: [
        {
          id: 'grid-anime',
          type: 'grid',
          title: 'Top Anime',
          columns: 6,
          items: [{ id: 501, title: 'Attack on Titan', media_type: 'series' }],
        },
      ],
    };

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    const layoutSpy = vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation((_client, screenId) => {
      if (screenId === 'home') return Promise.resolve(mockHomeLayout);
      if (screenId === 'anime') return Promise.resolve(mockAnimeLayout);
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
      expect(screen.getByText('Anime')).toBeInTheDocument();
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
      expect(document.activeElement?.id).toBe('hero-play-hero-home');
    });

    // Move to sidebar and down to anime
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('nav-screen-home');
    });
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(document.activeElement?.id).toBe('nav-screen-anime');

    // Press Enter
    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(layoutSpy).toHaveBeenCalledWith(mockClient, 'anime');

    await waitFor(() => {
      expect(screen.getByText('Top Anime')).toBeInTheDocument();
      expect(screen.getByText('Attack on Titan')).toBeInTheDocument();
    });
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

    const logo = screen.getByAltText('Kadr');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', './kadr-logo.png');

    const sidebar = screen.getByTestId('tv-sidebar');
    expect(sidebar).toHaveClass('bg-[#3B1111]');
    expect(sidebar.className).toContain('border-[rgba(245,229,229,0.08)]');

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('Shows')).toBeInTheDocument();
    expect(screen.getByText('Profiles')).toBeInTheDocument();

    const homeBtn = document.getElementById('nav-screen-home');
    expect(homeBtn?.className).toContain('bg-[#FF6B00]/15');
    expect(homeBtn?.className).toContain('text-[#F5E5E5]');

    const moviesBtn = document.getElementById('nav-screen-movies');
    expect(moviesBtn?.className).toContain('text-[#5C3C3C]');

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });
  });

  it('renders sidebar navigation items with 2x item height spacing (148px gap) in an auto-scroll container', async () => {
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

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-items-container')).toBeInTheDocument();
    });
    const container = screen.getByTestId('sidebar-items-container');
    expect(container.className).toContain('gap-[148px]');
    expect(container.className).toContain('overflow-y-auto');
    expect(container.className).toContain('scrollbar-none');
  });

  it('calls scrollIntoView when a sidebar button receives focus', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

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
      expect(document.activeElement?.id).toBe('hero-play-hero-home');
    });

    // Move focus from content to sidebar
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'smooth',
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

  it('displays error diagnostics and interactive action buttons when screen layout fetch fails', async () => {
    const fetchLayoutMock = vi.spyOn(screensApi, 'fetchScreenLayout').mockRejectedValue(
      new Error('Connection refused')
    );
    const onSwitchProfile = vi.fn();
    const onSwitchServer = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={onSwitchProfile}
          onSwitchServer={onSwitchServer}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load screen layout.')).toBeInTheDocument();
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
      expect(screen.getByText(/http:\/\/localhost:8492/)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    const switchProfileBtn = screen.getByRole('button', { name: /switch profile/i });
    expect(switchProfileBtn).toBeInTheDocument();
    fireEvent.click(switchProfileBtn);
    expect(onSwitchProfile).toHaveBeenCalledTimes(1);

    const changeServerBtn = screen.getByRole('button', { name: /change server/i });
    expect(changeServerBtn).toBeInTheDocument();
    fireEvent.click(changeServerBtn);
    expect(onSwitchServer).toHaveBeenCalledTimes(1);

    // Test retry
    fetchLayoutMock.mockResolvedValueOnce(mockHomeLayout);
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });
  });

  it('automatically triggers onSwitchProfile when layout fetch fails with 401 Unauthorized', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockRejectedValue(
      new Error('HTTP error 401: Unauthorized')
    );
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
      expect(onSwitchProfile).toHaveBeenCalledTimes(1);
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
    expect(onPlayItem).toHaveBeenCalledWith(101, 0);

    // Click on TV card
    fireEvent.click(screen.getByText('Top TV Show'));
    expect(onSelectItem).toHaveBeenCalledWith(201);
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

  /* ------------------------------------------------------------- */
  /* Spatial Navigation, D-Pad, Sidebar Expansion Tests            */
  /* ------------------------------------------------------------- */

  it('expands sidebar (w-64) and shows labels when sidebar is focused, collapses (w-28) when content is focused', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    const sidebar = screen.getByTestId('tv-sidebar');

    // Initially, Hero Play button has focus, so sidebar is collapsed
    expect(sidebar.classList.contains('w-28')).toBe(true);
    expect(sidebar.classList.contains('w-96')).toBe(false);

    // Press ArrowLeft from leftmost content element (hero play button) to bridge to sidebar
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });

    // Focus transitioned to nav-screen-home; sidebar should now be expanded
    expect(sidebar.classList.contains('w-96')).toBe(true);
    expect(sidebar.classList.contains('w-28')).toBe(false);

    // Label for Home button should be 'inline' and large text-3xl
    const homeLabel = screen.getByText('Home');
    expect(homeLabel.className).toContain('inline');
    expect(homeLabel.className).toContain('text-3xl');
    expect(homeLabel.className).not.toContain('hidden');

    // Press ArrowRight to return to content
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });

    // Sidebar should collapse back to w-28
    expect(sidebar.classList.contains('w-28')).toBe(true);
    expect(sidebar.classList.contains('w-96')).toBe(false);
  });

  it('transitions focus between content and sidebar via ArrowLeft and ArrowRight', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
      expect(document.activeElement?.id).toBe('hero-play-hero-home');
    });

    // Press ArrowLeft -> transitions to nav-screen-home
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('nav-screen-home');

    // Press ArrowRight -> transitions back to hero-play-hero-home
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('hero-play-hero-home');
  });

  it('returns focus to active tab in sidebar when Escape / TV Back is pressed from content', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
      expect(document.activeElement?.id).toBe('hero-play-hero-home');
    });

    // Press TV Back (10009)
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    expect(document.activeElement?.id).toBe('nav-screen-home');

    // Return to content
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('hero-play-hero-home');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(document.activeElement?.id).toBe('nav-screen-home');
  });

  it('navigates sidebar with ArrowDown and switches active tab on Enter key', async () => {
    const fetchSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockImplementation((_client, screenId) => {
        if (screenId === 'home') return Promise.resolve(mockHomeLayout);
        if (screenId === 'movies') return Promise.resolve(mockMoviesLayout);
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
      expect(document.activeElement?.id).toBe('hero-play-hero-home');
    });

    // Move to sidebar
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('nav-screen-home');
    });

    // Move down to 'nav-screen-movies'
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('nav-screen-movies');
    });

    // Press Enter to activate Movies tab
    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(fetchSpy).toHaveBeenCalledWith(mockClient, 'movies');

    await waitFor(() => {
      expect(screen.getByText('Feature Films')).toBeInTheDocument();
    });

    // Press ArrowRight to enter movie catalog
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('grid-grid-movies-10');
    });
  });

  it('automatically focuses first card in first widget when layout has no hero spotlight', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockMoviesLayout);

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

    await waitFor(() => {
      expect(screen.getByText('Feature Films')).toBeInTheDocument();
    });

    // In mockMoviesLayout, first widget is a grid with id 10
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('grid-grid-movies-10');
    });
  });

  it('pressing ArrowLeft from column 1+ in CatalogGridWidget stays within grid and does NOT jump to sidebar', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockMoviesLayout);

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

    await waitFor(() => {
      expect(document.activeElement?.id).toBe('grid-grid-movies-10');
    });

    // Move right to film-2 (column 1)
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-11');

    // Move right to film-5 (column 4)
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-12');
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-13');
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-14');

    // Now press ArrowLeft from column 4: must stay in grid and move to column 3
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-13');
    expect(document.activeElement?.id).not.toBe('nav-screen-movies');

    // Move left to film 12, 11, 10
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-12');
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-11');
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('grid-grid-movies-10');

    // From column 0 (10), ArrowLeft transitions to sidebar nav-screen-movies
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(document.activeElement?.id).toBe('nav-screen-movies');
  });

  it('does NOT intercept Backspace or Back key when typing in an input element', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <div>
          <input data-testid="search-input" defaultValue="query" />
          <BrowseScreen
            client={mockClient}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            onPlayItem={vi.fn()}
            onSwitchProfile={vi.fn()}
          />
        </div>
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    const input = screen.getByTestId('search-input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Fire Backspace event with input as target
    const backspaceEvent = new KeyboardEvent('keydown', {
      key: 'Backspace',
      keyCode: TVKeys.BACKSPACE,
      bubbles: true,
      cancelable: true,
    });
    const notCancelled = input.dispatchEvent(backspaceEvent);

    // Event must not be cancelled by BrowseScreen
    expect(notCancelled).toBe(true);
    // Focus must stay on input, NOT jump to nav-screen-home
    expect(document.activeElement).toBe(input);
  });

  it('does NOT intercept Back or Escape key when a modal dialog is open', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <div>
          <BrowseScreen
            client={mockClient}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            onPlayItem={vi.fn()}
            onSwitchProfile={vi.fn()}
          />
          <div role="dialog" aria-modal="true" data-testid="test-dialog">
            <button id="modal-btn" data-testid="modal-btn">Close Modal</button>
          </div>
        </div>
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    const modalBtn = screen.getByTestId('modal-btn');
    modalBtn.focus();
    expect(document.activeElement).toBe(modalBtn);

    // Fire Escape event while modal is open
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: TVKeys.BACK_WEB,
      bubbles: true,
      cancelable: true,
    });
    const notCancelled = modalBtn.dispatchEvent(escapeEvent);

    // Escape should not be swallowed or redirected to sidebar nav-screen-home
    expect(notCancelled).toBe(true);
    expect(document.activeElement).toBe(modalBtn);
  });

  it('displays lock icon for locked private library and invokes onLockedLibrary when selected', async () => {
    const onLockedLibrary = vi.fn();
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'vault-1', title: 'Secret Vault' },
    ];
    const mockLibraries = [
      { id: 'vault-1', name: 'Secret Vault', media_type: 'movie', is_private: true },
    ];

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onLockedLibrary={onLockedLibrary}
          libraries={mockLibraries}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Secret Vault')).toBeInTheDocument();
    });

    // Secret Vault tab has lock indicator
    const vaultBtn = screen.getByRole('button', { name: /Secret Vault/i });
    expect(vaultBtn).toBeInTheDocument();
    expect(vaultBtn.querySelector('svg')).toBeInTheDocument();

    // Click Secret Vault
    fireEvent.click(vaultBtn);

    // onLockedLibrary should be called with library id
    expect(onLockedLibrary).toHaveBeenCalledWith('vault-1');
  });

  it('renders locked library state with Unlock button when active tab is a locked private library', async () => {
    const onLockedLibrary = vi.fn();
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'vault-1', title: 'Secret Vault' },
    ];
    const mockLibraries = [
      { id: 'vault-1', name: 'Secret Vault', media_type: 'movie', is_private: true },
    ];

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue({
      id: 'vault-1',
      title: 'Secret Vault',
      widgets: [
        {
          id: 'grid-vault',
          type: 'grid',
          title: 'Secret Vault',
          columns: 6,
          items: [],
        },
      ],
    });

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          initialTab="vault-1"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onLockedLibrary={onLockedLibrary}
          libraries={mockLibraries}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Private Library Locked/i)).toBeInTheDocument();
    });

    const unlockBtn = screen.getByRole('button', { name: /Unlock with PIN/i });
    expect(unlockBtn).toBeInTheDocument();
    fireEvent.click(unlockBtn);
    expect(onLockedLibrary).toHaveBeenCalledWith('vault-1');
  });

  it('preserves active library tab when refreshKey changes after unlocking without redirecting to home', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'vault-1', title: 'Secret Vault' },
    ];
    const mockLibraries = [
      { id: 'vault-1', name: 'Secret Vault', media_type: 'movie', is_private: true },
    ];

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation(async (_client, screenId) => ({
      id: screenId,
      title: screenId === 'vault-1' ? 'Secret Vault' : 'Home',
      widgets: [
        {
          id: `widget-${screenId}`,
          type: 'grid',
          title: screenId === 'vault-1' ? 'Secret Vault Content' : 'Home Content',
          columns: 6,
          items: [
            {
              id: screenId === 'vault-1' ? 999 : 101,
              title: screenId === 'vault-1' ? 'Secret Item' : 'Home Item',
              media_type: 'movie',
            },
          ],
        },
      ],
    }));

    const { rerender } = render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          libraries={mockLibraries}
          refreshKey={0}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Secret Vault')).toBeInTheDocument();
    });

    // Select the Secret Vault library
    const vaultBtn = screen.getByRole('button', { name: /Secret Vault/i });
    fireEvent.click(vaultBtn);

    // Now mock library as unlocked on the client
    vi.spyOn(mockClient, 'isLibraryUnlocked').mockReturnValue(true);

    // Simulate unlock completion triggering refreshKey increment from App.tsx
    rerender(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          libraries={mockLibraries}
          refreshKey={1}
        />
      </FocusProvider>
    );

    // Should still display Secret Vault content, NOT redirect back to Home!
    await waitFor(() => {
      expect(screen.getByText('Secret Vault Content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Home Content')).not.toBeInTheDocument();
  });

  it('renders Browse Folders button on library screen and calls onBrowseFolder when clicked', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation(async (_client, screenId) => {
      if (screenId === 'movies') return mockMoviesLayout;
      return mockHomeLayout;
    });

    const onBrowseFolder = vi.fn();
    const mockLibraries = [
      { id: 'lib-movies-1', name: 'Movies', type: 'movie' as const, is_private: false },
    ];

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onBrowseFolder={onBrowseFolder}
          libraries={mockLibraries}
          initialTab="movies"
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folders/i })).toBeInTheDocument();
    });

    const browseFoldersBtn = screen.getByRole('button', { name: /Browse Folders/i });
    fireEvent.click(browseFoldersBtn);

    expect(onBrowseFolder).toHaveBeenCalledTimes(1);
    expect(onBrowseFolder).toHaveBeenCalledWith('lib-movies-1');
  });

  it('does not render Browse Folders button on home screen', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation(async (_client, screenId) => {
      if (screenId === 'movies') return mockMoviesLayout;
      return mockHomeLayout;
    });

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          initialTab="home"
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Popular Right Now')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Browse Folders/i })).not.toBeInTheDocument();
  });
});

