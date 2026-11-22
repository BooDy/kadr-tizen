import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { BrowseScreen } from '../../src/screens/BrowseScreen';
import { ApiClient } from '../../src/api/client';
import * as screensApi from '../../src/api/screens';
import * as librariesApi from '../../src/api/libraries';
import * as playlistsApi from '../../src/api/playlists';
import * as searchApi from '../../src/api/search';
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
    searchApi.resetSavedSearchState();
    mockClient = new ApiClient('http://localhost:8492');
    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'Shows' },
    ]);
    vi.spyOn(librariesApi, 'fetchLibraries').mockResolvedValue([]);
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
    expect(sidebar).toHaveClass('bg-[#0d0e15]');
    expect(sidebar.className).toContain('border-[rgba(255,255,255,0.05)]');

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

  it('renders sidebar navigation items in an auto-scroll container with 10px card spacing (no flex gap on Chromium 69)', async () => {
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
    expect(container.className).not.toContain('gap-');
    const homeCard = document.getElementById('nav-screen-home');
    expect(homeCard?.style.marginBottom).toBe('10px');
    expect(homeCard?.style.borderRadius).toBe('12px');
    expect(container.className).toContain('overflow-y-auto');
    expect(container.className).toContain('scrollbar-none');
  });

  it('calls instant scrollIntoView only when a focused sidebar button is clipped outside the scroll container', async () => {
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

    const container = screen.getByTestId('sidebar-items-container');
    const homeCard = document.getElementById('nav-screen-home')!;
    const moviesCard = document.getElementById('nav-screen-movies')!;

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 120,
      left: 0,
      top: 120,
      width: 320,
      height: 400,
      right: 320,
      bottom: 520,
      toJSON: () => {},
    });
    // Home card is fully visible inside container -> should NOT trigger scrollIntoView
    vi.spyOn(homeCard, 'getBoundingClientRect').mockReturnValue({
      x: 16,
      y: 140,
      left: 16,
      top: 140,
      width: 288,
      height: 72,
      right: 304,
      bottom: 212,
      toJSON: () => {},
    });
    // Movies card is clipped below container -> MUST trigger instant scrollIntoView (never smooth)
    vi.spyOn(moviesCard, 'getBoundingClientRect').mockReturnValue({
      x: 16,
      y: 490,
      left: 16,
      top: 490,
      width: 288,
      height: 72,
      right: 304,
      bottom: 562,
      toJSON: () => {},
    });

    // Move focus from content to visible Home sidebar item -> no scroll needed
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    // Move focus down to clipped Movies sidebar item -> instant scrollIntoView({ block: 'nearest' })
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
    });
  });

  it('never steals focus onto background BrowseScreen cards when refreshKey updates while a modal is active', async () => {
    const { useEffect } = await import('react');
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    function ModalFocusHarness({ refreshKey }: { refreshKey: number }) {
      const { focusedId, setFocusedId, pushTrap, popTrap } = useFocusContext();
      useEffect(() => {
        pushTrap('folder-browser-modal');
        setFocusedId('folder-item-503');
        return () => popTrap('folder-browser-modal');
      }, [pushTrap, popTrap, setFocusedId]);

      return (
        <div>
          <div data-testid="probe-focused-id">{focusedId ?? 'null'}</div>
          <button data-testid="clear-focus" onClick={() => setFocusedId(null)}>
            Clear Focus
          </button>
          <BrowseScreen
            client={mockClient}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            onPlayItem={vi.fn()}
            onSwitchProfile={vi.fn()}
            refreshKey={refreshKey}
          />
          <div role="dialog" aria-modal="true" data-testid="stacked-modal">
            <button id="folder-item-503">Folder Item 503</button>
          </div>
        </div>
      );
    }

    const { rerender } = render(
      <FocusProvider>
        <ModalFocusHarness refreshKey={0} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    // Because modal trap & [role="dialog"][aria-modal="true"] are mounted, initial load must NOT steal focus
    expect(screen.getByTestId('probe-focused-id').textContent).toBe('folder-item-503');

    // Clear focus while modal trap is active and trigger background BrowseScreen refreshKey increment
    fireEvent.click(screen.getByTestId('clear-focus'));
    expect(screen.getByTestId('probe-focused-id').textContent).toBe('null');

    rerender(
      <FocusProvider>
        <ModalFocusHarness refreshKey={1} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screensApi.fetchScreenLayout).toHaveBeenCalledTimes(2);
    });

    // Focus must NOT be stolen onto hero-play-hero-home
    expect(screen.getByTestId('probe-focused-id').textContent).toBe('null');
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
    expect(screen.getByTestId('nav-screen-home-card').style.display).toBe('none');
    expect(screen.getByTestId('nav-screen-home-tile').style.display).toBe('flex');

    // Press ArrowLeft from leftmost content element (hero play button) to bridge to sidebar
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });

    // Focus transitioned to nav-screen-home; sidebar should now be expanded
    expect(sidebar.classList.contains('w-96')).toBe(true);
    expect(sidebar.classList.contains('w-28')).toBe(false);

    // Expanded card (title, subtitle, path chip) is visible, collapsed tile is hidden
    const homeLabel = screen.getByText('Home');
    expect(homeLabel.className).toContain('text-lg');
    expect(screen.getByTestId('nav-screen-home-card').style.display).toBe('flex');
    expect(screen.getByTestId('nav-screen-home-tile').style.display).toBe('none');
    expect(screen.getByText('Featured & continue watching')).toBeInTheDocument();
    expect(screen.getByText('/home')).toBeInTheDocument();
    expect(screen.getByText('[OK] Open')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-library-count').style.display).not.toBe('none');

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

  it('displays only Home and actual server libraries in sidebar (excluding unbacked built-in Movies and TV Shows screens)', async () => {
    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'TV Shows' },
      { id: 'lib-series-uuid', title: 'Series' },
    ]);
    vi.spyOn(librariesApi, 'fetchLibraries').mockResolvedValue([
      { id: 'lib-series-uuid', name: 'Series', media_type: 'show', is_private: false },
    ]);
    const layoutSpy = vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation(async (_client, screenId) => ({
      id: screenId,
      title: screenId === 'lib-series-uuid' ? 'Series' : 'Home',
      widgets: [],
    }));

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
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Series')).toBeInTheDocument();
    });

    // Built-in placeholder screens not backed by any library on the server must not appear in sidebar
    expect(screen.queryByText('Movies')).not.toBeInTheDocument();
    expect(screen.queryByText('TV Shows')).not.toBeInTheDocument();

    // Clicking Series loads the Series library screen by its ID
    fireEvent.click(screen.getByRole('button', { name: /Series/i }));
    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledWith(mockClient, 'lib-series-uuid');
    });
  });

  it('renders Playlists sidebar tab, loads PlaylistsView without fetchScreenLayout, and bridges D-pad focus between sidebar and playlists', async () => {
    const layoutSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockResolvedValue(mockHomeLayout);
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([
      {
        id: 'pl-1',
        name: 'My Sci-Fi Queue',
        owner_user_id: 'user-1',
        owner_username: 'boody',
        is_public: false,
        is_editable: true,
        visible_item_count: 2,
        locked_item_count: 0,
        total_duration_seconds: 5400,
        cover_poster_urls: [],
        created_at: 1730000000,
        updated_at: 1730001000,
      },
      {
        id: 'pl-2',
        name: 'Second Column Queue',
        owner_user_id: 'user-1',
        owner_username: 'boody',
        is_public: true,
        is_editable: true,
        visible_item_count: 3,
        locked_item_count: 0,
        total_duration_seconds: 7200,
        cover_poster_urls: [],
        created_at: 1730000100,
        updated_at: 1730001100,
      },
    ]);

    const onOpenPlaylist = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          currentUserId="user-1"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onOpenPlaylist={onOpenPlaylist}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(document.getElementById('nav-screen-playlists')).not.toBeNull();
    });

    const playlistsNav = document.getElementById('nav-screen-playlists')!;
    fireEvent.click(playlistsNav);

    await waitFor(() => {
      expect(screen.getByTestId('playlists-view')).toBeInTheDocument();
      expect(screen.getByText('My Sci-Fi Queue')).toBeInTheDocument();
      expect(document.getElementById('playlist-card-pl-1')?.className).toContain('tv-focus-ring');
    });

    // Must not request AST layout for virtual 'playlists' screen
    expect(layoutSpy).not.toHaveBeenCalledWith(mockClient, 'playlists');

    // Focus sidebar Playlists item via Escape, then ArrowRight bridges back into playlist card
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(playlistsNav.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.getElementById('playlist-card-pl-1')?.className).toContain('tv-focus-ring');

    // ArrowLeft from leftmost col 0 playlist card bridges back to sidebar nav-screen-playlists
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(playlistsNav.className).toContain('tv-focus-ring');

    // Clicking playlist card invokes onOpenPlaylist
    fireEvent.click(screen.getByTestId('playlist-card-pl-1'));
    expect(onOpenPlaylist).toHaveBeenCalledWith('pl-1');
  });

  it('hides Browse Folders button when library path starts with plugin://', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockMoviesLayout);
    const pluginLibraries = [
      {
        id: 'lib-iptv',
        name: 'Live TV',
        type: 'movie' as const,
        is_private: false,
        path: 'plugin://iptv/channels',
      } as any,
    ];

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onBrowseFolder={vi.fn()}
          libraries={pluginLibraries}
          initialTab="lib-iptv"
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Feature Films')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Browse Folders/i })).not.toBeInTheDocument();
  });

  it('notifies onTabChange when activeTab changes', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation(async (_client, screenId) => {
      if (screenId === 'movies') return mockMoviesLayout;
      return mockHomeLayout;
    });

    const onTabChangeSpy = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onTabChange={onTabChangeSpy}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    // Click Movies tab
    fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));

    await waitFor(() => {
      expect(onTabChangeSpy).toHaveBeenCalledWith('movies');
    });
  });

  it('restores initialFocusId and notifies onContentFocusChange when focus changes', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    const onContentFocusChangeSpy = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          initialFocusId="card-carousel-home-201"
          onContentFocusChange={onContentFocusChangeSpy}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(document.getElementById('card-carousel-home-201')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.getElementById('card-carousel-home-201')?.className).toContain('tv-focus-ring');
    });

    expect(onContentFocusChangeSpy).toHaveBeenCalledWith('card-carousel-home-201');
  });

  it('renders Search sidebar tab above Playlists, mounts SearchView without fetchScreenLayout, and bridges D-pad focus between sidebar, keyboard, and results', async () => {
    const layoutSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockResolvedValue(mockHomeLayout);
    const searchSpy = vi.spyOn(searchApi, 'fetchSearchResults').mockResolvedValue({
      query: 'a',
      total: 1,
      items: [
        {
          id: 901,
          library_id: 'lib-movies',
          library_name: 'Movies',
          item_type: 'movie',
          title: 'Arrival',
          release_year: 2016,
          poster_url: '/poster/901.jpg',
          duration_seconds: 6960,
          playback_progress: 0,
        },
      ],
    });
    const onRequestExit = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          token="test-token"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onRequestExit={onRequestExit}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(document.getElementById('nav-screen-search')).not.toBeNull();
      expect(document.getElementById('nav-screen-playlists')).not.toBeNull();
    });

    const sidebarItems = screen.getByTestId('sidebar-items-container');
    const navIds = Array.from(sidebarItems.querySelectorAll('[id^="nav-screen-"]')).map(
      (el) => el.id
    );
    expect(navIds).toEqual([
      'nav-screen-home',
      'nav-screen-movies',
      'nav-screen-shows',
      'nav-screen-search',
      'nav-screen-playlists',
    ]);

    const searchNav = document.getElementById('nav-screen-search')!;
    fireEvent.click(searchNav);

    await waitFor(() => {
      expect(screen.getByTestId('search-view')).toBeInTheDocument();
    });
    expect(layoutSpy).not.toHaveBeenCalledWith(mockClient, 'search');

    // Escape outside <input> focuses sidebar Search item, and ArrowRight focuses search-key-a
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(searchNav.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.getElementById('search-key-a')?.className).toContain('tv-focus-ring');

    // ArrowLeft from leftmost search-key-a returns to nav-screen-search
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(searchNav.className).toContain('tv-focus-ring');

    // Return to search-key-a, press Enter to search 'a', and bridge right into results
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.getElementById('search-key-a')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    await waitFor(
      () => {
        expect(searchSpy).toHaveBeenCalledWith(
          mockClient,
          expect.objectContaining({ q: 'a' })
        );
        expect(document.getElementById('search-card-901')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
    }
    expect(document.getElementById('search-key-f')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.getElementById('search-card-901')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(document.getElementById('search-key-f')?.className).toContain('tv-focus-ring');

    // BACK_TIZEN when not editing <input> jumps back to nav-screen-search
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(searchNav.className).toContain('tv-focus-ring');

    // Return into SearchView, move up to search-query-input, enter IME edit mode
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.getElementById('search-key-f')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(document.getElementById('search-action-clear')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(document.getElementById('search-query-input')?.className).toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    const nativeInput = document.getElementById('search-native-input') as HTMLInputElement;
    expect(document.activeElement).toBe(nativeInput);

    // BACK_TIZEN dispatched on window while <input> is focused must blur <input> without jumping to sidebar
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.activeElement).not.toBe(nativeInput);
    expect(document.getElementById('search-query-input')?.className).toContain('tv-focus-ring');
    expect(searchNav.className).not.toContain('tv-focus-ring');
    expect(onRequestExit).not.toHaveBeenCalled();

    // Second BACK_TIZEN outside <input> returns to sidebar nav-screen-search
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(searchNav.className).toContain('tv-focus-ring');
    expect(onRequestExit).not.toHaveBeenCalled();

    // Third BACK_TIZEN while focused on nav-screen-search triggers onRequestExit
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(onRequestExit).toHaveBeenCalledTimes(1);
  });

  it('restores search-card-* initialFocusId after reload, clears it on tab switch, and routes Back to sidebar during in-flight reload', async () => {
    searchApi.setSavedSearchState({ query: 'arrival', filter: 'movie' });
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    let resolveSearch!: (val: { query: string; total: number; items: any[] }) => void;
    vi.spyOn(searchApi, 'fetchSearchResults').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );
    const onRequestExit = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          token="test-token"
          initialTab="search"
          initialFocusId="search-card-901"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
          onRequestExit={onRequestExit}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('search-loading')).toBeInTheDocument();
      expect(document.getElementById('search-filter-movie')?.className).toContain('tv-focus-ring');
    });

    await act(async () => {
      resolveSearch({
        query: 'arrival',
        total: 1,
        items: [
          {
            id: 901,
            library_id: 'lib-movies',
            library_name: 'Movies',
            item_type: 'movie',
            title: 'Arrival',
            release_year: 2016,
            poster_url: '/poster/901.jpg',
            duration_seconds: 6960,
            playback_progress: 0,
          },
        ],
      });
    });

    await waitFor(() => {
      expect(document.getElementById('search-card-901')?.className).toContain('tv-focus-ring');
    });

    // Switch away from Search and back: starts fresh on search-key-a (consumed initialFocusId)
    fireEvent.click(document.getElementById('nav-screen-home')!);
    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    vi.spyOn(searchApi, 'fetchSearchResults').mockImplementation(
      () => new Promise(() => {})
    );
    fireEvent.click(document.getElementById('nav-screen-search')!);
    await waitFor(() => {
      expect(document.getElementById('search-key-a')?.className).toContain('tv-focus-ring');
    });

    // Pressing BACK_TIZEN while a search fetch is in flight returns to nav-screen-search without exiting
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.getElementById('nav-screen-search')?.className).toContain('tv-focus-ring');
    expect(onRequestExit).not.toHaveBeenCalled();
  });
});

