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
import * as subtitlesApi from '../src/api/subtitles';
import * as playlistsApi from '../src/api/playlists';
import * as playbackApi from '../src/api/playback';
import * as searchApi from '../src/api/search';
import { MediaItemDetail } from '../src/api/items';
import { ApiClient } from '../src/api/client';
import { ScreenLayout } from '../src/types/ast';
import { ProfileCard, LibraryFolderResponse } from '../src/types/kadr';
import { TVKeys } from '../src/navigation/keys';

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
  fetchLibraries: vi.fn(),
}));

vi.mock('../src/api/events', () => ({
  subscribeEvents: vi.fn(),
}));

vi.mock('../src/api/playlists', async () => {
  const actual = await vi.importActual<typeof import('../src/api/playlists')>(
    '../src/api/playlists'
  );
  return {
    ...actual,
    fetchPlaylists: vi.fn().mockResolvedValue([]),
    createPlaylist: vi.fn(),
    fetchPlaylistDetail: vi.fn(),
    updatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    addPlaylistItems: vi.fn(),
    removePlaylistItem: vi.fn(),
    reorderPlaylistItems: vi.fn(),
  };
});

vi.mock('../src/api/playback', () => ({
  reportPlaybackProgress: vi.fn(),
  setItemWatchState: vi.fn(),
  setBatchWatchState: vi.fn(),
}));

vi.mock('../src/api/subtitles', () => ({
  fetchItemSubtitles: vi.fn().mockResolvedValue([
    {
      id: 1,
      media_item_id: 200,
      source: 'embedded',
      language: 'eng',
      title: 'English [Original]',
      format: 'srt',
      is_default: true,
      is_forced: false,
      stream_url: '/api/v1/subtitles/1/stream.vtt',
    },
  ]),
}));

let driverStateCb: ((state: string) => void) | null = null;
let driverTimeCb: ((pos: number, dur: number) => void) | null = null;

vi.mock('../src/player/avplay-driver', () => {
  return {
    createPlayerDriver: () => ({
      init: vi.fn().mockImplementation(async () => {
        driverStateCb?.('playing');
      }),
      play: vi.fn(() => {
        driverStateCb?.('playing');
      }),
      pause: vi.fn(() => {
        driverStateCb?.('paused');
      }),
      seekTo: vi.fn(),
      destroy: vi.fn(),
      setSubtitleTrack: vi.fn(),
      onTimeUpdate: vi.fn((cb) => {
        driverTimeCb = cb;
      }),
      onStateChange: vi.fn((cb) => {
        driverStateCb = cb;
      }),
      onError: vi.fn(),
    }),
  };
});

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
      items: [
        { id: 200, title: 'Trending Dune Part Two', media_type: 'movie' },
        { id: 300, title: 'Trending Severance Series', media_type: 'show' },
      ],
    },
  ],
};

const mockSeriesDetail: MediaItemDetail = {
  id: 300,
  title: 'Severance',
  overview: 'Mark Scout leads a team at Lumon Industries.',
  release_year: 2022,
  media_type: 'show',
  episodes: [
    {
      id: 301,
      season: 1,
      episode: 1,
      title: 'Good News About Hell',
      playback_progress: 0,
    },
    {
      id: 302,
      season: 1,
      episode: 2,
      title: 'Half Loop',
      playback_progress: 0,
    },
    {
      id: 303,
      season: 2,
      episode: 1,
      title: 'Episode 201',
      playback_progress: 0,
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
  async function renderAuthenticatedApp(token = 'valid-test-token') {
    vi.mocked(auth.authenticatePin).mockResolvedValueOnce({
      success: true,
      data: {
        token,
        user_id: 'user-1',
        username: 'Alice',
        role: 'admin',
      },
    });

    const utils = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice'));

    await waitFor(() => {
      expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    return utils;
  }

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    searchApi.resetSavedSearchState();
    driverStateCb = null;
    driverTimeCb = null;
    vi.mocked(discovery.discoverLocalServers).mockResolvedValue([]);
    vi.mocked(auth.listProfiles).mockResolvedValue(mockProfiles);
    vi.mocked(screensApi.fetchScreens).mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'Shows' },
    ]);
    vi.mocked(screensApi.fetchScreenLayout).mockResolvedValue(mockHomeLayout);
    vi.mocked(items.fetchMediaItem).mockImplementation(async (_client, id) => {
      if (id === 300 || id === '300') return mockSeriesDetail;
      return mockItemDetail;
    });
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockFolderResponse);
    vi.mocked(librariesApi.fetchLibraries).mockResolvedValue([]);
    vi.mocked(playlistsApi.fetchPlaylists).mockResolvedValue([]);
    vi.mocked(eventsApi.subscribeEvents).mockReturnValue(vi.fn());
    vi.mocked(playbackApi.setItemWatchState).mockResolvedValue(undefined);
    vi.mocked(playbackApi.setBatchWatchState).mockResolvedValue({ updated: 2, watched: true });
    vi.spyOn(ApiClient.prototype, 'fetchText').mockResolvedValue('WEBVTT\n\n');
    vi.mocked(subtitlesApi.fetchItemSubtitles).mockResolvedValue([
      {
        id: 1,
        media_item_id: 200,
        source: 'embedded',
        language: 'eng',
        title: 'English [Original]',
        format: 'srt',
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/1/stream.vtt',
      },
    ]);
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

  it('always renders ProfileSelectScreen on startup even if a token was previously cached in localStorage, without flashing BrowseScreen or running discovery', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    localStorage.setItem('kadr_server_name', 'My Kadr');
    localStorage.setItem('kadr_token', 'stale-admin-token');

    render(<App />);

    expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    expect(screen.queryByText('Hero Dune Feature')).not.toBeInTheDocument();
    expect(discovery.discoverLocalServers).not.toHaveBeenCalled();
    expect(screensApi.fetchScreens).not.toHaveBeenCalled();
    expect(screensApi.fetchScreenLayout).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(localStorage.getItem('kadr_token')).toBeNull();
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

    await renderAuthenticatedApp();

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

    await renderAuthenticatedApp();

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

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });

    // Click Play on Hero widget
    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));

    // Player screen is now visible (OSD shows title)
    await waitFor(() => {
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });

    // Press Escape twice: first hides OSD, second exits PlayerScreen
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });
  });

  it('plays item from ItemDetailModal into PlayerScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

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

    // Press Escape twice: first hides OSD, second exits PlayerScreen -> must return to item details page
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();
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

    await renderAuthenticatedApp();

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

    await renderAuthenticatedApp();

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

    await renderAuthenticatedApp();

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

    // Select media item inside folder browser -> opens ItemDetailModal on top with z-[60]
    const folderItem = screen.getByText('Dune: Part Two');
    fireEvent.click(folderItem);

    await waitFor(() => {
      expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();
      const detailModal = screen.getByRole('dialog', { name: 'Dune: Part Two' });
      expect(detailModal).toHaveClass('z-[60]');
    });
  });

  it('opens ImageViewerModal from FolderBrowserModal for single image and for slideshow', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

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

    // Verify folder thumbnail includes token
    const folderThumb = screen.getByAltText('dune_poster.jpg');
    expect(folderThumb).toHaveAttribute(
      'src',
      'http://192.168.1.100:8492/images/dune_poster.jpg?token=valid-test-token'
    );

    // Click single image
    const photo = screen.getByText('dune_poster.jpg');
    fireEvent.click(photo);

    // ImageViewerModal is displayed
    await waitFor(() => {
      expect(screen.getByTestId('hud-header')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    // Verify viewer main image and filmstrip thumbnail include token
    const viewerImages = screen.getAllByAltText('dune_poster.jpg');
    const mainViewerImg = viewerImages.find((img) => img.className.includes('object-contain'));
    expect(mainViewerImg).toBeInTheDocument();
    expect(mainViewerImg).toHaveAttribute(
      'src',
      'http://192.168.1.100:8492/images/dune_poster.jpg?token=valid-test-token'
    );
    const filmstripThumb0 = screen.getByTestId('filmstrip-thumb-0').querySelector('img');
    expect(filmstripThumb0).toHaveAttribute(
      'src',
      'http://192.168.1.100:8492/images/dune_poster.jpg?token=valid-test-token'
    );

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

    await renderAuthenticatedApp();

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

    let eventCallback: ((type: string, payload: unknown) => void) | null = null;
    const mockUnsubscribe = vi.fn();

    vi.mocked(eventsApi.subscribeEvents).mockImplementation((_url, _token, onEvent) => {
      eventCallback = onEvent;
      return mockUnsubscribe;
    });

    await renderAuthenticatedApp();

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

    // Open item detail and click "Browse Folder" to open FolderBrowserModal
    fireEvent.click(screen.getByText('Trending Dune Part Two'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Movies Library' })).toBeInTheDocument();
    });
    expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledTimes(1);

    // Trigger library:updated SSE event -> verifies folder re-fetch
    act(() => {
      eventCallback!('library:updated', { library_id: 'lib-movies' });
    });

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledTimes(2);
    });

    // Close folder browser modal
    // Back steps up one folder at a time and closes the browser once the library root is reached
    await waitFor(() => {
      const backBtn = screen.queryByRole('button', { name: /^(Back|Close)$/i });
      if (backBtn) fireEvent.click(backBtn);
      expect(screen.queryByRole('heading', { name: 'Movies Library' })).not.toBeInTheDocument();
    });

    // Switch profile to trigger logout and cleanup
    const profilesBtn = screen.getByRole('button', { name: /Profiles/i });
    fireEvent.click(profilesBtn);

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  it('unlocks private library directly from BrowseScreen sidebar via PinPadModal and refreshes screen layout', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    vi.mocked(screensApi.fetchScreens).mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'lib-vault', title: 'Vault' },
    ]);
    vi.mocked(librariesApi.fetchLibraries).mockResolvedValue([
      { id: 'lib-vault', name: 'Vault', media_type: 'movie', is_private: true },
    ]);

    vi.mocked(librariesApi.unlockLibrary).mockResolvedValue({
      token: 'jwt-unlock-vault',
      unlock_token: 'vault-unlock-token-123',
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByText('Vault')).toBeInTheDocument();
    });

    // Click Vault button on sidebar
    fireEvent.click(screen.getByText('Vault'));

    // PinPadModal opens
    await waitFor(() => {
      expect(screen.getByText('Unlock Private Library')).toBeInTheDocument();
    });

    // Enter PIN: 1, 2, 3, 4
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    await waitFor(() => {
      expect(librariesApi.unlockLibrary).toHaveBeenCalledWith(
        expect.anything(),
        'lib-vault',
        '1234'
      );
    });

    // PinPadModal closes
    await waitFor(() => {
      expect(screen.queryByText('Unlock Private Library')).not.toBeInTheDocument();
    });
  });

  it('navigates series seasons in ItemDetailModal and plays selected episode into PlayerScreen', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByText('Trending Severance Series')).toBeInTheDocument();
    });

    // Click on the series card to open detail
    fireEvent.click(screen.getByText('Trending Severance Series'));

    // Modal renders with seasons and episodes
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Season 1')).toBeInTheDocument();
      expect(screen.getByText('Season 2')).toBeInTheDocument();
      expect(screen.getByText('Good News About Hell')).toBeInTheDocument();
    });

    // Switch to Season 2 tab
    fireEvent.click(screen.getByText('Season 2'));

    await waitFor(() => {
      expect(screen.getByText('Episode 201')).toBeInTheDocument();
    });

    // Play Episode 201
    fireEvent.click(screen.getByText('Episode 201'));

    // Modal closes and player opens with episode title
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Episode 201')).toBeInTheDocument();
    });

    // Press Escape twice: first hides OSD, second exits PlayerScreen
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
      expect(screen.getByText('Episode 201')).toBeInTheDocument();
    });
  });

  it('opens and closes SubtitleModal from PlayerScreen and handles back navigation', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });

    // Click Play on Hero widget to enter PlayerScreen
    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));

    await waitFor(() => {
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });

    // Pause playback so subtitles button appears
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK' });

    await waitFor(() => {
      expect(screen.getByText('paused')).toBeInTheDocument();
      expect(screen.getByTestId('subtitles-button')).toBeInTheDocument();
    });

    // Click Subtitles button to open SubtitleModal
    fireEvent.click(screen.getByTestId('subtitles-button'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Subtitles' })).toBeInTheDocument();
      expect(screen.getByText('English [Original] (eng)')).toBeInTheDocument();
      expect(screen.getByText('Off')).toBeInTheDocument();
    });

    // Close SubtitleModal via Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Subtitles' })).not.toBeInTheDocument();
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });

    // Press Escape twice: first hides OSD when paused, second exits PlayerScreen
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });
  });

  it('navigates from BrowseScreen library header to FolderBrowserModal via Browse Folders button', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    // Switch to Movies tab
    fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folders/i })).toBeInTheDocument();
    });

    // Click Browse Folders
    fireEvent.click(screen.getByRole('button', { name: /Browse Folders/i }));

    // FolderBrowserModal opens
    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalled();
    });
  });

  it('plays playlist queue from PlaylistsView -> PlaylistDetailModal -> PlayerScreen and handles playlist:updated SSE events', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    let sseHandler: ((type: string, payload: unknown) => void) | null = null;
    vi.mocked(eventsApi.subscribeEvents).mockImplementation((_url, _token, onEvent) => {
      sseHandler = onEvent;
      return vi.fn();
    });

    const summary = {
      id: 'pl-e2e-1',
      name: 'Alice Weekend Queue',
      owner_user_id: 'user-1',
      owner_username: 'Alice',
      is_public: false,
      is_editable: true,
      visible_item_count: 2,
      locked_item_count: 0,
      total_duration_seconds: 7200,
      cover_poster_urls: ['/poster1.jpg'],
      created_at: 1730000000,
      updated_at: 1730001000,
    };

    vi.mocked(playlistsApi.fetchPlaylists).mockResolvedValue([summary]);
    vi.mocked(playlistsApi.fetchPlaylistDetail).mockResolvedValue({
      summary,
      items: [
        {
          position: 0,
          added_at: 1730000100,
          duration_seconds: 3600,
          resume_position_seconds: 600,
          card: {
            id: 501,
            title: 'Queue Film One',
            media_type: 'movie',
          },
        },
        {
          position: 1,
          added_at: 1730000200,
          duration_seconds: 3600,
          resume_position_seconds: 120,
          card: {
            id: 502,
            title: 'Queue Film Two',
            media_type: 'movie',
          },
        },
      ],
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(document.getElementById('nav-screen-playlists')).not.toBeNull();
    });

    fireEvent.click(document.getElementById('nav-screen-playlists')!);

    await waitFor(() => {
      expect(screen.getByText('Alice Weekend Queue')).toBeInTheDocument();
    });

    // Open PlaylistDetailModal
    fireEvent.click(screen.getByTestId('playlist-card-pl-e2e-1'));

    await waitFor(() => {
      expect(screen.getByText('Queue Film One')).toBeInTheDocument();
      expect(screen.getByText('Queue Film Two')).toBeInTheDocument();
    });

    // Play All -> opens PlayerScreen with Queue Film One
    fireEvent.click(document.getElementById('playlist-play-all-btn')!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Queue Film One')).toBeInTheDocument();
    });

    // Exit player via Escape: first hides OSD, second exits -> returns directly to PlaylistDetailModal and refreshes it
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Alice Weekend Queue' })).toBeInTheDocument();
    });
    expect(vi.mocked(playlistsApi.fetchPlaylistDetail).mock.calls.length).toBeGreaterThanOrEqual(2);

    // Emit SSE playlist:updated with action: 'deleted' -> closes open PlaylistDetailModal
    await act(async () => {
      sseHandler?.('playlist:updated', {
        playlist_id: 'pl-e2e-1',
        user_id: 'user-1',
        action: 'deleted',
        timestamp: 1730002000,
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Alice Weekend Queue' })
      ).not.toBeInTheDocument();
    });
  });

  it('adds a folder to an existing playlist from FolderBrowserModal via Add Folder to Playlist', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const targetSummary = {
      id: 'pl-folder-dest',
      name: 'Folder Target Playlist',
      owner_user_id: 'user-1',
      owner_username: 'Alice',
      is_public: false,
      is_editable: true,
      visible_item_count: 0,
      locked_item_count: 0,
      total_duration_seconds: 0,
      cover_poster_urls: [],
      created_at: 1730000000,
      updated_at: 1730001000,
    };
    vi.mocked(playlistsApi.fetchPlaylists).mockResolvedValue([targetSummary]);
    vi.mocked(playlistsApi.addPlaylistItems).mockResolvedValue({
      added_count: 3,
      skipped_duplicate_count: 0,
      summary: targetSummary,
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folders/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Browse Folders/i }));

    await waitFor(() => {
      expect(document.getElementById('folder-add-to-playlist-btn')).not.toBeNull();
    });

    fireEvent.click(document.getElementById('folder-add-to-playlist-btn')!);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Add to Playlist' })).toBeInTheDocument();
      expect(screen.getByText('Folder Target Playlist')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-to-playlist-option-pl-folder-dest'));
    });

    expect(playlistsApi.addPlaylistItems).toHaveBeenCalledWith(
      expect.anything(),
      'pl-folder-dest',
      {
        folder: {
          library_id: 'movies',
          path: '',
          recursive: false,
        },
      }
    );
  });

  it('retains exact folder item selection & visible focus indicator on FolderBrowserModal -> click item -> ItemDetailModal -> Back -> Enter even across SSE layout:changed refreshes, and supports CH_DOWN/CH_UP fast jump', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    let sseHandler: ((type: string, payload: unknown) => void) | null = null;
    vi.mocked(eventsApi.subscribeEvents).mockImplementation((_url, _token, onEvent) => {
      sseHandler = onEvent;
      return vi.fn();
    });

    const largeMoviesFolder: LibraryFolderResponse = {
      library_id: 'movies',
      library_name: 'Movies Library',
      current_path: '',
      breadcrumbs: [{ name: 'Movies Library', path: '' }],
      directories: [],
      // 36 items = 6 rows of 6 columns (700..735)
      items: Array.from({ length: 36 }, (_, idx) => ({
        id: 700 + idx,
        title: `Folder Film ${idx}`,
        subtitle: '2025',
        media_type: 'movie',
      })),
      images: [],
    };

    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(largeMoviesFolder);
    vi.mocked(items.fetchMediaItem).mockImplementation(async (_client, itemId) => ({
      id: Number(itemId),
      title: `Detail For Item ${itemId}`,
      overview: `Detailed overview for ${itemId}`,
      release_year: 2025,
      media_type: 'movie',
      library_id: 'movies',
      folder_path: '',
    }));

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    // Switch to Movies library and open FolderBrowserModal
    fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folders/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Browse Folders/i }));

    await waitFor(() => {
      expect(document.getElementById('folder-item-700')?.getAttribute('data-focused')).toBe('true');
    });

    // Test CH_DOWN / CH_UP fast jump (~5 rows = +30 / -30 items in 6-col grid)
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(document.getElementById('folder-item-730')?.getAttribute('data-focused')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(document.getElementById('folder-item-700')?.getAttribute('data-focused')).toBe('true');

    // Click item 704 ("Folder Film 4") directly -> opens ItemDetailModal
    const card704 = document.getElementById('folder-item-704')!;
    await act(async () => {
      fireEvent.click(card704);
    });

    await waitFor(() => {
      expect(screen.getByText('Detail For Item 704')).toBeInTheDocument();
    });
    expect(items.fetchMediaItem).toHaveBeenLastCalledWith(expect.anything(), 704);

    // Trigger SSE layout:changed while ItemDetailModal is stacked over FolderBrowserModal
    await act(async () => {
      sseHandler?.('layout:changed', { screen_id: 'movies' });
    });

    // Press Back (Escape / TV Back) to close ItemDetailModal and return to FolderBrowserModal
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_TIZEN });
    });

    await waitFor(() => {
      expect(screen.queryByText('Detail For Item 704')).not.toBeInTheDocument();
    });

    // Trigger another SSE layout:changed while back on FolderBrowserModal -> BrowseScreen MUST NOT steal focus!
    await act(async () => {
      sseHandler?.('layout:changed', { screen_id: 'movies' });
    });

    const restoredCard704 = document.getElementById('folder-item-704')!;
    expect(restoredCard704).toBeInTheDocument();
    await waitFor(() => {
      expect(restoredCard704.getAttribute('data-focused')).toBe('true');
    });
    expect(restoredCard704.className).toContain('tv-focus-ring');
    expect(restoredCard704.className).toContain('border-[#FF6B00]');

    // Pressing Enter/OK MUST re-open that SAME folder item (704), NOT a background BrowseScreen video!
    vi.mocked(items.fetchMediaItem).mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    await waitFor(() => {
      expect(items.fetchMediaItem).toHaveBeenCalledTimes(1);
      expect(items.fetchMediaItem).toHaveBeenCalledWith(expect.anything(), 704);
      expect(screen.getByText('Detail For Item 704')).toBeInTheDocument();
    });
  });

  it('updates episode card progress and WATCHED badge on ItemDetailModal after watching an episode', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByText('Trending Severance Series')).toBeInTheDocument();
    });

    // Open Severance Series detail modal
    await act(async () => {
      fireEvent.click(screen.getByText('Trending Severance Series'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
      expect(screen.getByText('Season 2')).toBeInTheDocument();
    });

    // Switch to Season 2
    await act(async () => {
      fireEvent.click(screen.getByText('Season 2'));
    });

    await waitFor(() => {
      expect(screen.getByText('Episode 201')).toBeInTheDocument();
    });

    // Initially Episode 201 is not watched
    expect(screen.queryByText('WATCHED')).not.toBeInTheDocument();

    // Click Episode 201 to enter PlayerScreen
    await act(async () => {
      fireEvent.click(screen.getByText('Episode 201'));
    });

    await waitFor(() => {
      expect(screen.getByText('Episode 201')).toBeInTheDocument();
    });

    // Simulate playback progress (completed)
    await act(async () => {
      driverTimeCb?.(9960000, 9960000);
    });

    const updatedSeriesDetail: MediaItemDetail = {
      ...mockSeriesDetail,
      episodes: mockSeriesDetail.episodes?.map((ep) =>
        ep.id === 303 ? { ...ep, playback_progress: 1 } : ep
      ),
    };

    let resolveFetch: ((value: MediaItemDetail) => void) | null = null;
    const fetchDeferred = new Promise<MediaItemDetail>((resolve) => {
      resolveFetch = resolve;
    });

    vi.mocked(items.fetchMediaItem).mockClear();
    vi.mocked(items.fetchMediaItem).mockImplementation(async (_client, id) => {
      if (id === 300 || id === '300') return fetchDeferred;
      return mockItemDetail;
    });

    // Exit PlayerScreen (first Escape hides OSD, second exits)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    // Optimistic assertion: fetchMediaItem is still pending, but WATCHED is already rendered optimistically!
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
      expect(screen.getByText('WATCHED')).toBeInTheDocument();
    });
    expect(items.fetchMediaItem).toHaveBeenCalledWith(expect.anything(), 300);

    // Resolve fetchMediaItem
    await act(async () => {
      resolveFetch!(updatedSeriesDetail);
    });

    // Assert WATCHED remains rendered cleanly after fetchMediaItem resolves
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
      expect(screen.getByText('WATCHED')).toBeInTheDocument();
    });
  });

  it('returns to exact video subfolder (not root folder listing) when exiting video played from FolderBrowserModal', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const rootFolderResponse: LibraryFolderResponse = {
      library_id: 'lib-movies',
      library_name: 'Movies Library',
      current_path: '',
      breadcrumbs: [{ name: 'Movies Library', path: '' }],
      directories: [{ name: 'Season 1', path: 'Season 1', item_count: 1 }],
      items: [],
      images: [],
    };

    const subfolderResponse: LibraryFolderResponse = {
      library_id: 'lib-movies',
      library_name: 'Movies Library',
      current_path: 'Season 1',
      parent_path: '',
      breadcrumbs: [
        { name: 'Movies Library', path: '' },
        { name: 'Season 1', path: 'Season 1' },
      ],
      directories: [],
      items: [
        {
          id: 501,
          title: 'folder-item-501',
          media_type: 'movie',
        },
      ],
      images: [],
    };

    const mock501Detail: MediaItemDetail = {
      id: 501,
      title: 'folder-item-501',
      media_type: 'movie',
      overview: 'Episode 501 Overview',
      library_id: 'lib-movies',
      folder_path: 'Season 1',
    };

    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === 'Season 1') {
        return subfolderResponse;
      }
      return rootFolderResponse;
    });

    vi.mocked(items.fetchMediaItem).mockImplementation(async (_client, id) => {
      if (id === 501 || id === '501') return mock501Detail;
      return mockItemDetail;
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    // Switch to Movies tab
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse Folders/i })).toBeInTheDocument();
    });

    // Open FolderBrowserModal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Browse Folders/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Season 1')).toBeInTheDocument();
    });

    // Enter subfolder Season 1
    await act(async () => {
      fireEvent.click(screen.getByText('Season 1'));
    });

    await waitFor(() => {
      expect(screen.getByText('folder-item-501')).toBeInTheDocument();
    });

    // Click item 501 -> ItemDetailModal opens
    await act(async () => {
      fireEvent.click(screen.getByText('folder-item-501'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'folder-item-501' })).toBeInTheDocument();
      expect(screen.getByText('Episode 501 Overview')).toBeInTheDocument();
      expect(document.getElementById('detail-play-btn')).toBeInTheDocument();
    });

    // Click Play -> enters PlayerScreen
    await act(async () => {
      fireEvent.click(document.getElementById('detail-play-btn')!);
    });

    await waitFor(() => {
      expect(screen.getByText('folder-item-501')).toBeInTheDocument();
    });

    // Exit PlayerScreen (two Escapes: hide OSD, exit)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    // ItemDetailModal restored
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'folder-item-501' })).toBeInTheDocument();
      expect(screen.getByText('Episode 501 Overview')).toBeInTheDocument();
    });

    // Press Back (Escape) to close ItemDetailModal
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    // Assert FolderBrowserModal is still at path: 'Season 1' with folder-item-501 focused
    await waitFor(() => {
      expect(screen.getByText('folder-item-501')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'folder-item-501' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Movies Library' })).toBeInTheDocument();
    });

    const itemCard501 = document.getElementById('folder-item-501');
    expect(itemCard501).toBeInTheDocument();
    expect(itemCard501?.getAttribute('data-focused')).toBe('true');

    // Press Back once more climbs from 'Season 1' to ''
    const backBtn = screen.getByRole('button', { name: /Back/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Season 1')).toBeInTheDocument();
    });
  });

  it('preserves active library tab on BrowseScreen and does not fabricate ItemDetailModal after direct play', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const mockMoviesLayout: ScreenLayout = {
      id: 'movies',
      title: 'Movies',
      widgets: [
        {
          id: 'movies-hero',
          type: 'hero_banner',
          data: {
            id: 200,
            title: 'Movies Hero Feature',
            media_type: 'movie',
          },
        },
      ],
    };

    vi.mocked(screensApi.fetchScreenLayout).mockImplementation(async (_client, screenId) => {
      if (screenId === 'movies') return mockMoviesLayout;
      return mockHomeLayout;
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Movies$/i })).toBeInTheDocument();
    });

    // Switch to Movies tab
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Movies Hero Feature')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    });

    // Direct play via Hero Play button
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });

    // Exit PlayerScreen (two Escapes)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    });

    // Assert ItemDetailModal is NOT opened
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Movies Hero Feature')).toBeInTheDocument();
    });

    // Assert BrowseScreen remains on Movies tab
    const moviesTabBtn = screen.getByRole('button', { name: /^Movies$/i });
    expect(moviesTabBtn).toBeInTheDocument();
    expect(moviesTabBtn.className).toContain('bg-[#FF6B00]/15');
  });

  it('restores ItemDetailModal when closing FolderBrowserModal opened via Browse Folder button', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const rootFolderResponse: LibraryFolderResponse = {
      ...mockFolderResponse,
      current_path: '',
      breadcrumbs: [{ name: 'Movies Library', path: '' }],
    };

    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === '') return rootFolderResponse;
      return mockFolderResponse;
    });

    await renderAuthenticatedApp();

    await waitFor(() => {
      expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
    });

    // Open Dune: Part Two detail modal
    await act(async () => {
      fireEvent.click(screen.getByText('Trending Dune Part Two'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
      expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
    });

    // Click Browse Folder
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));
    });

    // FolderBrowserModal opens at item's folder
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Dune: Part Two' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Movies Library' })).toBeInTheDocument();
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(
        expect.anything(),
        'lib-movies',
        'Movies/Sci-Fi/Dune'
      );
    });

    // Climb to root via root breadcrumb
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Movies Library' }));
    });

    // Now at root, button is Close
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });

    // Close FolderBrowserModal via Close button
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // Assert ItemDetailModal (Dune: Part Two) is restored!
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
      expect(screen.getByText('Paul Atreides unites with Chani and the Fremen.')).toBeInTheDocument();
    });
  });

  it('disarms the pre-boot HTML error trap immediately when App mounts', async () => {
    const disarmSpy = vi.fn();
    (window as any).__kadrDisarmBootTrap = disarmSpy;
    try {
      render(<App />);
      await waitFor(() => {
        expect(disarmSpy).toHaveBeenCalledTimes(1);
      });
    } finally {
      delete (window as any).__kadrDisarmBootTrap;
    }
  });

  it('opens ExitConfirmModal on Back from BrowseScreen root sidebar (after retreating from content) and calls Tizen exit on confirm', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');
    const exitSpy = vi.fn();
    (window as any).tizen = {
      application: {
        getCurrentApplication: () => ({ exit: exitSpy }),
      },
    };

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
      });

      // Ensure focus is on content card (PinPadModal trap pop during layout load may place focus on nav-screen-home)
      if (document.activeElement?.id === 'nav-screen-home') {
        await act(async () => {
          fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        });
      }
      expect(document.activeElement?.id).toBe('hero-play-hero-1');

      // First Back: retreats from content to sidebar without opening ExitConfirmModal
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });

      expect(document.activeElement?.id).toBe('nav-screen-home');
      expect(screen.queryByRole('dialog', { name: /Exit Kadr/i })).not.toBeInTheDocument();

      // Second Back while on root sidebar: opens ExitConfirmModal
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Exit Kadr/i })).toBeInTheDocument();
        expect(document.getElementById('exit-cancel-btn')).toHaveClass('tv-focus-ring');
      });

      // Press Back once inside ExitConfirmModal -> cancels without exiting and restores sidebar focus
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Exit Kadr/i })).not.toBeInTheDocument();
      });
      expect(exitSpy).not.toHaveBeenCalled();
      expect(document.activeElement?.id).toBe('nav-screen-home');

      // Press Back on sidebar again -> ArrowRight + Enter confirms exit
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Exit Kadr/i })).toBeInTheDocument();
        expect(document.getElementById('exit-cancel-btn')).toHaveClass('tv-focus-ring');
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
      expect(document.getElementById('exit-confirm-btn')).toHaveClass('tv-focus-ring');

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
      });

      expect(exitSpy).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as any).tizen;
    }
  });

  it('opens ExitConfirmModal on Back from ServerConnectScreen after blurring manual IP input and ignores Backspace while editing', async () => {
    const exitSpy = vi.fn();
    (window as any).tizen = {
      application: {
        getCurrentApplication: () => ({ exit: exitSpy }),
      },
    };

    try {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('e.g. 192.168.1.100') as HTMLInputElement;
      input.focus();
      expect(document.activeElement).toBe(input);

      // Backspace while editing input must NOT open ExitConfirmModal
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });
      });
      expect(screen.queryByRole('dialog', { name: /Exit Kadr/i })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(input);

      // First TV Back while editing blurs the input without opening ExitConfirmModal
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });
      expect(document.activeElement).not.toBe(input);
      expect(screen.queryByRole('dialog', { name: /Exit Kadr/i })).not.toBeInTheDocument();

      // Second TV Back opens ExitConfirmModal
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Exit Kadr/i })).toBeInTheDocument();
        expect(document.getElementById('exit-cancel-btn')).toHaveClass('tv-focus-ring');
      });

      // Back inside ExitConfirmModal cancels cleanly without exiting
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Exit Kadr/i })).not.toBeInTheDocument();
      });
      expect(exitSpy).not.toHaveBeenCalled();

      // Open again and click Exit Kadr
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Exit Kadr/i })).toBeInTheDocument();
        expect(document.getElementById('exit-cancel-btn')).toHaveClass('tv-focus-ring');
      });
      fireEvent.click(screen.getByRole('button', { name: /Exit Kadr/i }));
      expect(exitSpy).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as any).tizen;
    }
  });

  it('redirects cleanly to ProfileSelectScreen with session-expired banner on mid-session 401 without logging out on invalid private-library PIN', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const actualLibraries = await vi.importActual<typeof import('../src/api/libraries')>(
      '../src/api/libraries'
    );
    const lockedErr = new Error('HTTP error 403: LIBRARY_LOCKED');
    (lockedErr as any).status = 403;

    vi.mocked(foldersApi.fetchLibraryFolders)
      .mockRejectedValueOnce(lockedErr)
      .mockResolvedValue(mockFolderResponse);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    vi.mocked(librariesApi.unlockLibrary).mockImplementationOnce(async (client, libraryId, pin) =>
      actualLibraries.unlockLibrary(client, libraryId, pin)
    );
    vi.mocked(librariesApi.unlockLibrary).mockResolvedValueOnce({
      token: 'jwt-unlock',
      unlock_token: 'unlock-token-999',
    });

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
      });
      expect(localStorage.getItem('kadr_token')).toBe('valid-test-token');

      fireEvent.click(screen.getByText('Trending Dune Part Two'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Browse Folder/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Browse Folder/i }));

      await waitFor(() => {
        expect(screen.getByText('Unlock Private Library')).toBeInTheDocument();
        expect(document.getElementById('keypad-1')).toHaveClass('tv-focus-ring');
      });

      // Wrong private-library PIN returns HTTP 401 with skipUnauthorizedHandler: true -> MUST NOT log out
      await act(async () => {
        fireEvent.keyDown(window, { key: '0', keyCode: 48 });
        fireEvent.keyDown(window, { key: '0', keyCode: 48 });
        fireEvent.keyDown(window, { key: '0', keyCode: 48 });
        fireEvent.keyDown(window, { key: '0', keyCode: 48 });
      });

      await waitFor(() => {
        expect(screen.getByText(/HTTP error 401/i)).toBeInTheDocument();
      });
      expect(localStorage.getItem('kadr_token')).toBe('valid-test-token');
      expect(screen.queryByTestId('session-expired-banner')).not.toBeInTheDocument();

      // Valid private-library PIN unlocks FolderBrowserModal
      await act(async () => {
        fireEvent.keyDown(window, { key: '1', keyCode: 49 });
        fireEvent.keyDown(window, { key: '2', keyCode: 50 });
        fireEvent.keyDown(window, { key: '3', keyCode: 51 });
        fireEvent.keyDown(window, { key: '4', keyCode: 52 });
      });

      await waitFor(() => {
        expect(screen.queryByText('Unlock Private Library')).not.toBeInTheDocument();
        expect(screen.getByText('Dune: Part Two')).toBeInTheDocument();
      });

      // Now trigger a real ApiClient 401 on fetchMediaItem inside FolderBrowserModal
      vi.mocked(items.fetchMediaItem).mockImplementationOnce(async (client, itemId) =>
        client.fetch<MediaItemDetail>(`/api/v1/items/${itemId}`)
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Dune: Part Two'));
      });

      await waitFor(() => {
        expect(screen.getByText("Who's watching?")).toBeInTheDocument();
        expect(screen.getByTestId('session-expired-banner')).toHaveTextContent(
          'Session expired — please enter your PIN to continue'
        );
      });
      expect(localStorage.getItem('kadr_token')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Movies Library' })).not.toBeInTheDocument();

      // Re-authenticating clears the session-expired notice
      vi.mocked(auth.authenticatePin).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'refreshed-token-456',
          user_id: 'user-1',
          username: 'Alice',
          role: 'admin',
        },
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Alice'));
      });
      await waitFor(() => {
        expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
        expect(document.getElementById('keypad-1')).toHaveClass('tv-focus-ring');
      });
      await act(async () => {
        fireEvent.keyDown(window, { key: '1', keyCode: 49 });
        fireEvent.keyDown(window, { key: '2', keyCode: 50 });
        fireEvent.keyDown(window, { key: '3', keyCode: 51 });
        fireEvent.keyDown(window, { key: '4', keyCode: 52 });
      });
      await waitFor(() => {
        expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
      });
      expect(localStorage.getItem('kadr_token')).toBe('refreshed-token-456');

      // Manual switch profile should NOT show the old session-expired banner
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Profiles/i }));
      });
      await waitFor(() => {
        expect(screen.getByText("Who's watching?")).toBeInTheDocument();
      });
      expect(screen.queryByTestId('session-expired-banner')).not.toBeInTheDocument();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('resets activeBrowseTab and lastBrowseFocusId on mid-session 401 so re-authentication returns to Home cleanly', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const mockMoviesLayout: ScreenLayout = {
      id: 'movies',
      title: 'Movies',
      widgets: [
        {
          id: 'carousel-1',
          type: 'carousel',
          title: 'Movies Grid',
          items: [{ id: 200, title: 'Movies Card Dune', media_type: 'movie' }],
        },
      ],
    };

    const layoutSpy = vi
      .mocked(screensApi.fetchScreenLayout)
      .mockImplementation(async (_client, screenId) => {
        if (screenId === 'movies') return mockMoviesLayout;
        return mockHomeLayout;
      });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    try {
      vi.mocked(auth.authenticatePin).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'valid-test-token',
          user_id: 'user-1',
          username: 'Alice',
          role: 'admin',
        },
      });

      await act(async () => {
        render(<App />);
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Alice'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: '1', keyCode: 49 });
        fireEvent.keyDown(window, { key: '2', keyCode: 50 });
        fireEvent.keyDown(window, { key: '3', keyCode: 51 });
        fireEvent.keyDown(window, { key: '4', keyCode: 52 });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
      });

      // Switch to Movies tab and move focus onto card-carousel-1-200 (an ID that also exists on Home)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Movies$/i }));
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Movies Card Dune')).toBeInTheDocument();
      });

      if (document.activeElement?.id !== 'card-carousel-1-200') {
        await act(async () => {
          fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        });
      }
      expect(document.activeElement?.id).toBe('card-carousel-1-200');

      // Trigger a 401 via ApiClient while on the Movies tab with card-carousel-1-200 focused
      vi.mocked(items.fetchMediaItem).mockImplementationOnce(async (client, itemId) =>
        client.fetch<MediaItemDetail>(`/api/v1/items/${itemId}`)
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Movies Card Dune'));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText("Who's watching?")).toBeInTheDocument();
        expect(screen.getByTestId('session-expired-banner')).toBeInTheDocument();
      });

      // Re-authenticate as Alice and verify BrowseScreen starts fresh on Home with default focus
      layoutSpy.mockClear();
      vi.mocked(auth.authenticatePin).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'refreshed-token-home',
          user_id: 'user-1',
          username: 'Alice',
          role: 'admin',
        },
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Alice'));
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: '1', keyCode: 49 });
        fireEvent.keyDown(window, { key: '2', keyCode: 50 });
        fireEvent.keyDown(window, { key: '3', keyCode: 51 });
        fireEvent.keyDown(window, { key: '4', keyCode: 52 });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Hero Dune Feature')).toBeInTheDocument();
      });

      if (document.activeElement?.id === 'nav-screen-home') {
        await act(async () => {
          fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        });
      }

      const homeTabBtn = screen.getByRole('button', { name: /^Home$/i });
      const moviesTabBtn = screen.getByRole('button', { name: /^Movies$/i });
      expect(homeTabBtn.className).toContain('bg-[#FF6B00]/15');
      expect(moviesTabBtn.className).not.toContain('bg-[#FF6B00]/15');
      expect(layoutSpy).toHaveBeenCalledWith(expect.anything(), 'home');
      expect(layoutSpy).not.toHaveBeenCalledWith(expect.anything(), 'movies');
      expect(document.activeElement?.id).toBe('hero-play-hero-1');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('toggles movie and Season watch states from ItemDetailModal, calls playback states APIs, updates UI optimistically, and triggers BrowseScreen refresh', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const actualPlayback = await vi.importActual<typeof import('../src/api/playback')>(
      '../src/api/playback'
    );

    let resolveMoviePut: ((res: Response) => void) | null = null;
    const moviePutDeferred = new Promise<Response>((resolve) => {
      resolveMoviePut = resolve;
    });

    let statesPutCallCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/v1/playback/states')) {
        statesPutCallCount++;
        if (statesPutCallCount === 1) {
          return moviePutDeferred;
        }
        if (statesPutCallCount === 2) {
          return new Response(JSON.stringify({ updated: 2, watched: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Server error' }), {
          status: 500,
          statusText: 'Internal Server Error',
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.mocked(playbackApi.setItemWatchState).mockImplementation(actualPlayback.setItemWatchState);
    vi.mocked(playbackApi.setBatchWatchState).mockImplementation(actualPlayback.setBatchWatchState);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
      });

      // 1. Open Dune: Part Two (in-progress movie with resume_position_ms = 120000)
      await act(async () => {
        fireEvent.click(screen.getByText('Trending Dune Part Two'));
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
        expect(screen.getByText(/Resume \(2m\)/i)).toBeInTheDocument();
      });

      vi.mocked(screensApi.fetchScreenLayout).mockClear();

      // Click Mark Watched -> optimistic flip while PUT /api/v1/playback/states/200 is pending
      act(() => {
        fireEvent.click(document.getElementById('detail-watch-toggle-btn')!);
      });

      expect(document.getElementById('detail-watch-toggle-btn')).toHaveTextContent('Mark Unwatched');
      expect(document.getElementById('detail-play-btn')).toBeInTheDocument();
      expect(document.getElementById('detail-resume-btn')).not.toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://192.168.1.100:8492/api/v1/playback/states/200',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ watched: true }),
        })
      );

      // Resolve PUT -> triggers BrowseScreen layout refresh
      await act(async () => {
        resolveMoviePut!(
          new Response(JSON.stringify({ watch_state: 'completed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      await waitFor(() => {
        expect(screensApi.fetchScreenLayout).toHaveBeenCalled();
      });

      // Close movie detail modal
      await act(async () => {
        fireEvent.click(document.getElementById('detail-close-btn')!);
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // 2. Open Severance, play Episode 301 partway (populating sessionProgressRef), then exit
      await act(async () => {
        fireEvent.click(screen.getByText('Trending Severance Series'));
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Good News About Hell'));
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Good News About Hell')).toBeInTheDocument();
      });

      act(() => {
        driverTimeCb?.(300000, 1000000);
      });

      // Exit PlayerScreen back to Severance detail modal
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      });
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Severance' })).toBeInTheDocument();
        expect(document.getElementById('season-watch-toggle-btn')).toHaveTextContent(
          'Mark Season 1 Watched'
        );
      });

      vi.mocked(screensApi.fetchScreenLayout).mockClear();

      // Click Mark Season 1 Watched -> calls PUT /api/v1/playback/states batch, updates UI, and refreshes BrowseScreen
      await act(async () => {
        fireEvent.click(document.getElementById('season-watch-toggle-btn')!);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://192.168.1.100:8492/api/v1/playback/states',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ item_ids: [301, 302], watched: true }),
        })
      );

      await waitFor(() => {
        expect(document.getElementById('season-watch-toggle-btn')).toHaveTextContent(
          'Mark Season 1 Unwatched'
        );
        expect(screen.getAllByText('WATCHED')).toHaveLength(2);
        expect(screensApi.fetchScreenLayout).toHaveBeenCalled();
      });

      // Close Severance and verify rollback on API error for Dune: Part Two
      await act(async () => {
        fireEvent.click(document.getElementById('detail-close-btn')!);
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Trending Dune Part Two'));
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(document.getElementById('detail-watch-toggle-btn')!);
      });

      // Rolled back cleanly after 500 error
      await waitFor(() => {
        expect(screen.getByText(/Resume \(2m\)/i)).toBeInTheDocument();
        expect(document.getElementById('detail-watch-toggle-btn')).toHaveTextContent('Mark Watched');
      });
    } finally {
      warnSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it('rolls back watch state, clears stale library unlock token, and opens PinPadModal on 403 LIBRARY_LOCKED watch toggle', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const actualPlayback = await vi.importActual<typeof import('../src/api/playback')>(
      '../src/api/playback'
    );

    const removeTokenSpy = vi.spyOn(ApiClient.prototype, 'removeLibraryUnlockToken');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(items.fetchMediaItem).mockResolvedValueOnce({
      ...mockItemDetail,
      library_id: 'lib-private-vault',
    });

    let putAttempt = 0;
    const capturedHeaders: Array<string | null> = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/v1/playback/states')) {
        putAttempt++;
        const hdrs = new Headers(init?.headers);
        capturedHeaders.push(hdrs.get('X-Kadr-Unlocked'));
        if (putAttempt === 1) {
          return new Response(JSON.stringify({ error: 'LIBRARY_LOCKED' }), {
            status: 403,
            statusText: 'Forbidden',
          });
        }
        return new Response(JSON.stringify({ watch_state: 'completed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.mocked(playbackApi.setItemWatchState).mockImplementation(actualPlayback.setItemWatchState);
    vi.mocked(librariesApi.unlockLibrary).mockResolvedValueOnce({
      token: 'jwt-fresh',
      unlock_token: 'fresh-unlock-token',
    });

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(screen.getByText('Trending Dune Part Two')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Trending Dune Part Two'));
      });
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
        expect(screen.getByText(/Resume \(2m\)/i)).toBeInTheDocument();
      });

      // Trigger watch toggle -> 403 LIBRARY_LOCKED
      await act(async () => {
        fireEvent.click(document.getElementById('detail-watch-toggle-btn')!);
      });

      await waitFor(() => {
        expect(removeTokenSpy).toHaveBeenCalledWith('lib-private-vault');
        expect(screen.getByText('Unlock Private Library')).toBeInTheDocument();
        expect(document.getElementById('detail-watch-toggle-btn')).toHaveTextContent('Mark Watched');
        expect(screen.getByText(/Resume \(2m\)/i)).toBeInTheDocument();
      });

      // Enter PIN in PinPadModal -> unlocks library with fresh token and closes PinPadModal
      await act(async () => {
        fireEvent.keyDown(window, { key: '1', keyCode: 49 });
        fireEvent.keyDown(window, { key: '2', keyCode: 50 });
        fireEvent.keyDown(window, { key: '3', keyCode: 51 });
        fireEvent.keyDown(window, { key: '4', keyCode: 52 });
      });

      await waitFor(() => {
        expect(librariesApi.unlockLibrary).toHaveBeenCalledWith(
          expect.any(ApiClient),
          'lib-private-vault',
          '1234'
        );
        expect(screen.queryByText('Unlock Private Library')).not.toBeInTheDocument();
      });

      // Retrying watch toggle succeeds with the new unlock token header
      await act(async () => {
        fireEvent.click(document.getElementById('detail-watch-toggle-btn')!);
      });

      await waitFor(() => {
        expect(document.getElementById('detail-watch-toggle-btn')).toHaveTextContent(
          'Mark Unwatched'
        );
      });
      expect(capturedHeaders[1]).toContain('fresh-unlock-token');
    } finally {
      removeTokenSpy.mockRestore();
      warnSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it('searches globally from BrowseScreen Search tab, opens ItemDetailModal on [OK], preserves search state across PlayerScreen, and clears search state on profile switch', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const searchUrls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/v1/search')) {
        searchUrls.push(url);
        return new Response(
          JSON.stringify({
            query: 'dune',
            total: 1,
            items: [
              {
                id: 200,
                library_id: 'lib-movies',
                library_name: 'Movies',
                item_type: 'movie',
                title: 'Dune: Part Two',
                release_year: 2024,
                poster_url: '/api/v1/artwork/200/poster',
                badge: '4K',
                duration_seconds: 9960,
                playback_progress: 0.25,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(screen.getByText('Trending')).toBeInTheDocument();
        expect(document.getElementById('nav-screen-search')).not.toBeNull();
      });

      // Navigate via D-pad to nav-screen-search (home -> movies -> shows -> search)
      if (document.activeElement?.id !== 'nav-screen-home') {
        act(() => {
          fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
        });
      }
      expect(document.getElementById('nav-screen-home')?.className).toContain('tv-focus-ring');

      for (let i = 0; i < 3; i++) {
        act(() => {
          fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
        });
      }
      expect(document.getElementById('nav-screen-search')?.className).toContain('tv-focus-ring');

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
      });

      await waitFor(() => {
        expect(screen.getByTestId('search-view')).toBeInTheDocument();
      });

      // Enter SearchView via ArrowRight onto search-key-a
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
      expect(document.getElementById('search-key-a')?.className).toContain('tv-focus-ring');

      // Type 'dune' via D-pad keypad and select Movies filter
      fireEvent.click(document.getElementById('search-key-d')!);
      fireEvent.click(document.getElementById('search-key-u')!);
      fireEvent.click(document.getElementById('search-key-n')!);
      fireEvent.click(document.getElementById('search-key-e')!);
      fireEvent.click(document.getElementById('search-filter-movie')!);

      await waitFor(
        () => {
          expect(
            searchUrls.some((u) => u.includes('q=dune') && u.includes('item_type=movie'))
          ).toBe(true);
          expect(screen.getByTestId('search-card-200')).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Navigate across keyboard right edge to search-card-200 and press [OK]
      for (let i = 0; i < 6; i++) {
        act(() => {
          fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        });
      }
      expect(document.getElementById('search-card-200')?.className).toContain('tv-focus-ring');

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
      });

      // Play from ItemDetailModal -> PlayerScreen
      fireEvent.click(screen.getByRole('button', { name: /Resume/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Dune: Part Two')).toBeInTheDocument();
      });

      // Exit PlayerScreen (two Escapes: hide OSD, exit player) -> returns to ItemDetailModal
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      });
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Dune: Part Two' })).toBeInTheDocument();
      });

      // Close ItemDetailModal -> BrowseScreen remains on Search tab with query, filter, and results preserved
      fireEvent.click(document.getElementById('detail-close-btn')!);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('search-view')).toBeInTheDocument();
        expect(screen.getByTestId('search-card-200')).toBeInTheDocument();
      });

      const nativeInput = screen.getByTestId('search-native-input') as HTMLInputElement;
      expect(nativeInput.value).toBe('dune');
      expect(document.getElementById('search-filter-movie')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(document.getElementById('nav-screen-search')?.className).toContain('bg-[#FF6B00]/15');
      expect(searchApi.getSavedSearchState()).toEqual({ query: 'dune', filter: 'movie' });

      // Switching profile resets saved search state cleanly
      fireEvent.click(document.getElementById('nav-switch-profile')!);

      await waitFor(() => {
        expect(screen.getByText("Who's watching?")).toBeInTheDocument();
      });
      expect(searchApi.getSavedSearchState()).toEqual({ query: '', filter: 'all' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('clears saved Search state on mid-session 401 unauthorized and server switch', async () => {
    localStorage.setItem('kadr_server_url', 'http://192.168.1.100:8492');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/v1/search')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          statusText: 'Unauthorized',
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      await renderAuthenticatedApp();

      await waitFor(() => {
        expect(document.getElementById('nav-screen-search')).not.toBeNull();
      });

      fireEvent.click(document.getElementById('nav-screen-search')!);
      await waitFor(() => {
        expect(screen.getByTestId('search-view')).toBeInTheDocument();
      });

      // Trigger search query -> 401 redirects to ProfileSelectScreen and resets saved search state
      fireEvent.click(document.getElementById('search-key-a')!);

      await waitFor(
        () => {
          expect(screen.getByText("Who's watching?")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
      expect(searchApi.getSavedSearchState()).toEqual({ query: '', filter: 'all' });

      // Re-authenticate with layout error so Change Server button is rendered, then trigger handleSwitchServer
      vi.mocked(screensApi.fetchScreenLayout).mockRejectedValueOnce(new Error('Server down'));
      vi.mocked(auth.authenticatePin).mockResolvedValueOnce({
        success: true,
        data: {
          token: 'valid-test-token-2',
          user_id: 'user-1',
          username: 'Alice',
          role: 'admin',
        },
      });
      fireEvent.click(screen.getByText('Alice'));
      await waitFor(() => {
        expect(screen.getByText(/Enter PIN for Alice/i)).toBeInTheDocument();
      });
      fireEvent.keyDown(window, { key: '1', keyCode: 49 });
      fireEvent.keyDown(window, { key: '2', keyCode: 50 });
      fireEvent.keyDown(window, { key: '3', keyCode: 51 });
      fireEvent.keyDown(window, { key: '4', keyCode: 52 });

      await waitFor(() => {
        expect(document.getElementById('change-server-btn')).not.toBeNull();
      });
      searchApi.setSavedSearchState({ query: 'stale', filter: 'anime' });
      fireEvent.click(document.getElementById('change-server-btn')!);

      await waitFor(() => {
        expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();
      });
      expect(searchApi.getSavedSearchState()).toEqual({ query: '', filter: 'all' });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

