import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App';
import * as discovery from '../src/api/discovery';
import * as auth from '../src/api/auth';
import * as items from '../src/api/items';
import * as screensApi from '../src/api/screens';
import * as foldersApi from '../src/api/folders';
import * as librariesApi from '../src/api/libraries';
import * as eventsApi from '../src/api/events';
import { MediaItemDetail } from '../src/api/items';
import { ScreenLayout } from '../src/types/ast';
import { ProfileCard, LibraryFolderResponse } from '../src/types/kadr';

vi.mock('../src/api/discovery', () => ({
  discoverLocalServers: vi.fn(),
  verifyServer: vi.fn(),
}));

vi.mock('../src/api/auth', () => ({
  listProfiles: vi.fn(),
  authenticatePin: vi.fn(),
}));

vi.mock('../src/api/items', () => ({
  fetchMediaItem: vi.fn(),
}));

vi.mock('../src/api/screens', () => ({
  fetchScreens: vi.fn(),
  fetchScreenLayout: vi.fn(),
}));

vi.mock('../src/api/folders', () => ({
  fetchLibraryFolders: vi.fn(),
}));

vi.mock('../src/api/libraries', () => ({
  unlockLibrary: vi.fn(),
}));

vi.mock('../src/api/events', () => ({
  subscribeEvents: vi.fn(),
}));

vi.mock('../src/api/playback', () => ({
  reportPlaybackProgress: vi.fn(),
}));

vi.mock('../src/player/avplay-driver', () => ({
  createPlayerDriver: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    destroy: vi.fn(),
    setSubtitleTrack: vi.fn(),
    onTimeUpdate: vi.fn(),
    onStateChange: vi.fn(),
    onError: vi.fn(),
  }),
}));

const mockProfiles: ProfileCard[] = [
  { id: 'user-1', username: 'Alice', role: 'admin' },
  { id: 'user-2', username: 'Bob', role: 'user' },
];

const mockHomeLayout: ScreenLayout = {
  id: 'home',
  title: 'Home',
  widgets: [
    {
      id: 'hero-1',
      type: 'hero_banner',
      data: {
        id: 100,
        title: 'Hero Dune Feature',
        media_type: 'movie',
      },
    },
    {
      id: 'carousel-1',
      type: 'carousel',
      title: 'Trending',
      items: [{ id: 200, title: 'Trending Dune Part Two', media_type: 'movie' }],
    },
  ],
};

const mockItemDetail: MediaItemDetail = {
  id: 200,
  title: 'Dune: Part Two',
  overview: 'Paul Atreides unites with Chani and the Fremen.',
  release_year: 2024,
  duration_ms: 9960000,
  resume_position_ms: 120000,
  media_type: 'movie',
  resolution: '4K',
  library_id: 'lib-movies',
  folder_path: 'Movies/Sci-Fi/Dune',
};

const mockFolderResponse: LibraryFolderResponse = {
  library_id: 'lib-movies',
  library_name: 'Movies Library',
  current_path: 'Movies/Sci-Fi/Dune',
  breadcrumbs: [
    { name: 'Movies Library', path: '' },
    { name: 'Sci-Fi', path: 'Movies/Sci-Fi' },
    { name: 'Dune', path: 'Movies/Sci-Fi/Dune' },
  ],
  directories: [],
  items: [
    {
      id: 200,
      title: 'Dune: Part Two',
      media_type: 'movie',
    },
  ],
  images: [
    {
      name: 'dune_poster.jpg',
      path: 'Movies/Sci-Fi/Dune/dune_poster.jpg',
      url: '/images/dune_poster.jpg',
      size_bytes: 1048576,
    },
    {
      name: 'dune_still.jpg',
      path: 'Movies/Sci-Fi/Dune/dune_still.jpg',
      url: '/images/dune_still.jpg',
      size_bytes: 2097152,
    },
  ],
};

describe('App State Machine & Router', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(discovery.discoverLocalServers).mockResolvedValue([]);
    vi.mocked(auth.listProfiles).mockResolvedValue(mockProfiles);
    vi.mocked(screensApi.fetchScreens).mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'Shows' },
    ]);
    vi.mocked(screensApi.fetchScreenLayout).mockResolvedValue(mockHomeLayout);
    vi.mocked(items.fetchMediaItem).mockResolvedValue(mockItemDetail);
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockFolderResponse);
    vi.mocked(eventsApi.subscribeEvents).mockReturnValue(vi.fn());
  });

  it('renders ServerConnectScreen on first run when no server saved', async () => {
    render(<App />);

    expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Searching your Wi-Fi\/LAN/i)).not.toBeInTheDocument();
    });
  });

  it('loads profiles and renders ProfileSelectScreen if server is cached without token', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_server_name', 'Living Room Server');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    });

    expect(screen.getByText('Living Room Server')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('falls back to ServerConnectScreen when cached server profiles fail to load', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    vi.mocked(auth.listProfiles).mockRejectedValue(new Error('Connection lost'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();
    });
  });

  it('renders BrowseScreen directly when both server and token are cached', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_server_name', 'My Kadr');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
    });
    expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('selects server from ServerConnectScreen, caches it, and advances to ProfileSelectScreen', async () => {
    vi.mocked(discovery.discoverLocalServers).mockResolvedValue([
      { server_id: 'srv-1', name: 'Server One', url: 'http://192.168.1.10:8492' },
      { server_id: 'srv-2', name: 'Server Two', url: 'http://192.168.1.20:8492' },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Server One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Server One'));

    await waitFor(() => {
      expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    });

    expect(localStorage.getItem('kadr_server_url')).toBe('http://192.168.1.10:8492');
    expect(localStorage.getItem('kadr_server_name')).toBe('Server One');
    expect(screen.getByText('Server One')).toBeInTheDocument();
  });

  it('authenticates user PIN, caches token, and transitions from ProfileSelectScreen to BrowseScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_server_name', 'Living Room Server');

    vi.mocked(auth.authenticatePin).mockResolvedValue({
      success: true,
      data: {
        token: 'new-auth-token-123',
        user_id: 'user-1',
        username: 'Alice',
        role: 'admin',
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Select Alice
    fireEvent.click(screen.getByText('Alice'));

    await waitFor(() => {
      expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
    });

    // Enter PIN '1234' via remote key codes
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    await waitFor(() => {
      expect(auth.authenticatePin).toHaveBeenCalledWith(
        'http://192.168.1.100:8492',
        'user-1',
        '1234'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
    });

    expect(localStorage.getItem('kadr_token')).toBe('new-auth-token-123');
  });

  it('switches profile from BrowseScreen, clearing token and returning to ProfileSelectScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Profiles/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Profiles/i }));

    await waitFor(() => {
      expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    });

    expect(localStorage.getItem('kadr_token')).toBeNull();
  });

  it('opens and closes ItemDetailModal from BrowseScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    // Click on the trending card
    fireEvent.click(screen.getByText('Trending Dune Part Two'));

    await waitFor(() => {
      expect(items.fetchMediaItem).toHaveBeenCalledWith(expect.anything(), 200);
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('plays item directly from BrowseScreen into PlayerScreen and exits back to BrowseScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });

    // Click Play on Hero widget
    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));

    // Player screen is now visible (OSD shows title)
    await waitFor(() => {
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });

    // Press Escape to exit PlayerScreen
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });
  });

  it('plays item from ItemDetailModal into PlayerScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    // Click on the trending card to open detail
    fireEvent.click(screen.getByText('Trending Dune Part Two'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Modal shows Resume button
    const resumeBtn = screen.getByRole('button', { name: /Resume/i });
    fireEvent.click(resumeBtn);

    // Modal closes and player opens with item title
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Dune: Part Two')).toBeInTheDocument();
    });
  });

  it('navigates back from ProfileSelectScreen to ServerConnectScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    });

    // Press Escape to go back to server connect
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();
    });
  });

  it('displays reconnection overlay when network goes offline and hides when back online', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('reconnection-overlay')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('reconnection-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Connection Lost/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByTestId('reconnection-overlay')).not.toBeInTheDocument();
  });

  it('suppresses remote key events when reconnection overlay is displayed', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('reconnection-overlay')).toBeInTheDocument();

    const bubbleListener = vi.fn();
    window.addEventListener('keydown', bubbleListener);

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bubbleListener).not.toHaveBeenCalled();

    window.removeEventListener('keydown', bubbleListener);
  });

  it('navigates from ItemDetailModal to FolderBrowserModal via Browse Folder and opens item detail', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending')).toBeInTheDocument();
    });

    // Open detail modal for trending item
    fireEvent.click(screen.getByText('Trending Dune Part Two'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
    });

    // Click "Browse Folder"
    fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));

    // Item detail modal closes and FolderBrowserModal opens
    await waitFor(() => {
      expect(screen.queryByText('Paul Atreides unites with Chani and the Fremen.')).not.toBeInTheDocument();
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(
        expect.anything(),
        'lib-movies',
        'Movies/Sci-Fi/Dune'
      );
    });

    // Folder browser content is visible
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Movies Library' })).toBeInTheDocument();
      expect(screen.getByText('dune_poster.jpg')).toBeInTheDocument();
    });

    // Select media item inside folder browser -> opens ItemDetailModal again
    const folderItem = screen.getByText('Dune: Part Two');
    fireEvent.click(folderItem);

    await waitFor(() => {
      expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();
    });
  });

  it('opens ImageViewerModal from FolderBrowserModal for single image and for slideshow', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Trending Dune Part Two'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));

    await waitFor(() => {
      expect(screen.getByText('dune_poster.jpg')).toBeInTheDocument();
    });

    // Click single image
    const photo = screen.getByText('dune_poster.jpg');
    fireEvent.click(photo);

    // ImageViewerModal is displayed
    await waitFor(() => {
      expect(screen.getByTestId('hud-header')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    // Close image viewer via Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('hud-header')).not.toBeInTheDocument();
    });

    // Now start slideshow
    const slideshowBtn = screen.getByRole('button', { name: /Start Slideshow/i });
    fireEvent.click(slideshowBtn);

    await waitFor(() => {
      expect(screen.getByTestId('hud-header')).toBeInTheDocument();
      expect(screen.getByText('Playing Slideshow (4s)')).toBeInTheDocument();
    });

    // Close slideshow via Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('hud-header')).not.toBeInTheDocument();
    });
  });

  it('unlocks private library via PinPadModal and triggers folder re-fetch', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    // First fetch fails with 403 / LIBRARY_LOCKED
    const lockedErr = new Error('HTTP error 403: LIBRARY_LOCKED');
    (lockedErr as any).status = 403;
    vi.mocked(foldersApi.fetchLibraryFolders)
      .mockRejectedValueOnce(lockedErr)
      .mockResolvedValue(mockFolderResponse);

    vi.mocked(librariesApi.unlockLibrary).mockResolvedValue({
      token: 'jwt-unlock',
      unlock_token: 'unlock-token-999',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Trending Dune Part Two'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));

    // FolderBrowserModal reports locked library, rendering PinPadModal
    await waitFor(() => {
      expect(screen.getByText('Unlock Private Library')).toBeInTheDocument();
      expect(screen.getByText('Enter 4-digit PIN to access this library')).toBeInTheDocument();
    });

    // Enter 4 digits: 4, 3, 2, 1
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });

    await waitFor(() => {
      expect(librariesApi.unlockLibrary).toHaveBeenCalledWith(
        expect.anything(),
        'lib-movies',
        '4321'
      );
    });

    // PinPadModal closes and folder contents re-fetch successfully
    await waitFor(() => {
      expect(screen.queryByText('Unlock Private Library')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Movies Library' })).toBeInTheDocument();
    });
  });

  it('subscribes to SSE events on connect, dispatches events, and unbinds on logout', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_token', 'valid-test-token');

    let eventCallback: ((type: string, payload: unknown) => void) | null = null;
    const mockUnsubscribe = vi.fn();

    vi.mocked(eventsApi.subscribeEvents).mockImplementation((_url, _token, onEvent) => {
      eventCallback = onEvent;
      return mockUnsubscribe;
    });

    render(<App />);

    await waitFor(() => {
      expect(eventsApi.subscribeEvents).toHaveBeenCalledWith(
        'http://192.168.1.100:8492',
        'valid-test-token',
        expect.any(Function)
      );
    });

    expect(eventCallback).toBeTypeOf('function');

    // Trigger layout:changed SSE event
    expect(screensApi.fetchScreenLayout).toHaveBeenCalledTimes(1);
    act(() => {
      eventCallback!('layout:changed', { screen_id: 'home' });
    });

    await waitFor(() => {
      expect(screensApi.fetchScreenLayout).toHaveBeenCalledTimes(2);
    });

    // Switch profile to trigger logout and cleanup
    const profilesBtn = screen.getByRole('button', { name: /Profiles/i });
    fireEvent.click(profilesBtn);

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
