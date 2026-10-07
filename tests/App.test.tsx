import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App';
import * as discovery from '../src/api/discovery';
import * as auth from '../src/api/auth';
import * as items from '../src/api/items';
import * as screensApi from '../src/api/screens';
import { MediaItemDetail } from '../src/api/items';
import { ScreenLayout } from '../src/types/ast';
import { ProfileCard } from '../src/types/kadr';

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
  fetchScreenLayout: vi.fn(),
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
  screen_id: 'home',
  title: 'Home',
  widgets: [
    {
      id: 'hero-1',
      type: 'hero_spotlight',
      title: 'Hero Dune Feature',
      item_id: 'item-dune',
    },
    {
      id: 'carousel-1',
      type: 'card_carousel',
      title: 'Trending',
      items: [{ id: 'card-dune', item_id: 'item-dune', title: 'Trending Dune Part Two' }],
    },
  ],
};

const mockItemDetail: MediaItemDetail = {
  id: 'item-dune',
  title: 'Dune: Part Two',
  overview: 'Paul Atreides unites with Chani and the Fremen.',
  release_year: 2024,
  duration_ms: 9960000,
  resume_position_ms: 120000,
  media_type: 'movie',
  resolution: '4K',
};

describe('App State Machine & Router', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(discovery.discoverLocalServers).mockResolvedValue([]);
    vi.mocked(auth.listProfiles).mockResolvedValue(mockProfiles);
    vi.mocked(screensApi.fetchScreenLayout).mockResolvedValue(mockHomeLayout);
    vi.mocked(items.fetchMediaItem).mockResolvedValue(mockItemDetail);
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
      expect(items.fetchMediaItem).toHaveBeenCalledWith(expect.anything(), 'item-dune');
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
});
