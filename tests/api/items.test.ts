import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { fetchMediaItem } from '../../src/api/items';

describe('fetchMediaItem normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes backend ItemDetailsPayload with nested card and seconds into MediaItemDetail', async () => {
    const client = new ApiClient('http://localhost:8492');
    const backendPayload = {
      card: {
        id: 42,
        title: 'Dune: Part Two',
        subtitle: 'The saga continues',
        poster_url: '/api/v1/artwork/42/poster',
        backdrop_url: '/api/v1/artwork/42/backdrop',
        media_type: 'movie',
        playback_progress: 0.5,
        rating: 8.9,
        release_year: 2024,
        badge: '4K',
        duration_seconds: 9960,
      },
      overview: 'Paul Atreides unites with Chani and the Fremen.',
      genres: ['Action', 'Adventure', 'Sci-Fi'],
      duration_seconds: 9960,
      technical: {
        duration_seconds: 9960,
        resolution: '4K UHD',
        video_codec: 'hevc',
        audio_codec: 'truehd',
        audio_channels: 8,
        container: 'mkv',
      },
      stream_url: '/api/v1/stream/42',
      resume_position_seconds: 4980,
      episodes: null,
      library_id: 'lib-movies',
      folder_path: '/movies/dune',
    };

    const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(backendPayload);

    const result = await fetchMediaItem(client, 42);

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/42');
    expect(result.id).toBe(42);
    expect(result.title).toBe('Dune: Part Two');
    expect(result.overview).toBe('Paul Atreides unites with Chani and the Fremen.');
    expect(result.poster_url).toBe('/api/v1/artwork/42/poster');
    expect(result.backdrop_url).toBe('/api/v1/artwork/42/backdrop');
    expect(result.media_type).toBe('movie');
    expect(result.release_year).toBe(2024);
    expect(result.resolution).toBe('4K UHD');
    expect(result.duration_ms).toBe(9960000);
    expect(result.resume_position_ms).toBe(4980000);
    expect(result.library_id).toBe('lib-movies');
    expect(result.folder_path).toBe('/movies/dune');
  });

  it('preserves existing top-level fields if already populated', async () => {
    const client = new ApiClient('http://localhost:8492');
    const flatPayload = {
      id: 'movie-custom',
      title: 'Custom Title',
      duration_ms: 500000,
      resume_position_ms: 100000,
    };

    vi.spyOn(client, 'fetch').mockResolvedValue(flatPayload);

    const result = await fetchMediaItem(client, 'movie-custom');

    expect(result.id).toBe('movie-custom');
    expect(result.title).toBe('Custom Title');
    expect(result.duration_ms).toBe(500000);
    expect(result.resume_position_ms).toBe(100000);
  });
});
