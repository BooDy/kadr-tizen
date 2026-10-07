import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { fetchScreens, fetchScreenLayout, fetchWidgetData } from '../../src/api/screens';

describe('Screens API Client', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('test-token');
    vi.restoreAllMocks();
  });

  it('fetches registered screens list from /api/v1/screens', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'TV Shows' },
      { id: 'anime', title: 'Anime Collection' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScreens,
    });

    const screens = await fetchScreens(client);
    expect(screens).toHaveLength(4);
    expect(screens[3].title).toBe('Anime Collection');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/screens',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('fetches screen layout from /api/v1/screens/:id', async () => {
    const mockLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'home_spotlight',
          data: { id: 101, title: 'Inception', media_type: 'movie' },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLayout,
    });

    const layout = await fetchScreenLayout(client, 'home');
    expect(layout.title).toBe('Home');
    expect(layout.widgets[0].type).toBe('hero_banner');
  });

  it('fetches widget data from /api/v1/widgets/:id/data', async () => {
    const mockData = {
      widget_id: 'recently_added',
      items: [{ id: 201, title: 'Severance', media_type: 'series' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const data = await fetchWidgetData(client, 'recently_added', 'home');
    expect(data.items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/widgets/recently_added/data?screen_id=home&offset=0&limit=20',
      expect.anything()
    );
  });
});
