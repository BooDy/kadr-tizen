import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { PlaylistDetailModal } from '../../src/screens/PlaylistDetailModal';
import { ApiClient } from '../../src/api/client';
import * as playlistsApi from '../../src/api/playlists';
import { PlaylistDetail } from '../../src/api/playlists';

const makeEditableDetail = (): PlaylistDetail => ({
  summary: {
    id: 'pl-detail-1',
    name: 'Director Cut Queue',
    description: 'Three essential films',
    owner_user_id: 'user-1',
    owner_username: 'boody',
    is_public: false,
    is_editable: true,
    visible_item_count: 3,
    locked_item_count: 1,
    total_duration_seconds: 9600,
    cover_poster_urls: ['/api/v1/artwork/101/poster'],
    created_at: 1730000000,
    updated_at: 1730001000,
  },
  items: [
    {
      position: 0,
      added_at: 1730000100,
      duration_seconds: 5400,
      resume_position_seconds: 900, // 15m in progress -> 900_000 ms
      card: {
        id: 101,
        title: 'Blade Runner 2049',
        subtitle: 'Denis Villeneuve',
        release_year: 2017,
        media_type: 'movie',
        poster_url: '/api/v1/artwork/101/poster',
        playback_progress: 0.16,
      },
    },
    {
      position: 1,
      added_at: 1730000200,
      duration_seconds: 4200,
      // completed -> resume_position_seconds omitted -> 0 ms
      card: {
        id: 102,
        title: 'Dune: Part Two',
        release_year: 2024,
        media_type: 'movie',
        poster_url: '/api/v1/artwork/102/poster',
        playback_progress: 1.0,
      },
    },
    {
      position: 2,
      added_at: 1730000300,
      duration_seconds: 0,
      resume_position_seconds: 300, // live channel / duration <= 0 -> must force 0 ms
      card: {
        id: 103,
        title: 'Sci-Fi Live TV',
        media_type: 'live_channel',
        poster_url: '/api/v1/artwork/103/poster',
      },
    },
  ],
});

describe('PlaylistDetailModal', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('jwt-detail');
    vi.restoreAllMocks();
  });

  it('supports Play All, Shuffle (Fisher-Yates copy), and per-item Play from here with accurate resumeMs', async () => {
    const detail = makeEditableDetail();
    vi.spyOn(playlistsApi, 'fetchPlaylistDetail').mockResolvedValue(detail);
    const onPlayQueue = vi.fn();

    render(
      <FocusProvider>
        <PlaylistDetailModal
          isOpen={true}
          playlistId="pl-detail-1"
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-detail"
          onClose={vi.fn()}
          onPlayQueue={onPlayQueue}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Director Cut Queue')).toBeInTheDocument();
    });

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('playlist-item-resume-101')).toHaveTextContent('Resume 15:00');
    expect(screen.getByTestId('playlist-item-watched-102')).toHaveTextContent('Watched');
    expect(screen.getByText('LIVE')).toBeInTheDocument();

    // 1. Play All -> starts at index 0 with preserved resumeMs and metadata per item
    fireEvent.click(document.getElementById('playlist-play-all-btn')!);
    expect(onPlayQueue).toHaveBeenCalledWith(
      [
        {
          id: 101,
          title: 'Blade Runner 2049',
          resumeMs: 900000,
          subtitle: 'Denis Villeneuve',
          posterUrl: '/api/v1/artwork/101/poster',
          mediaType: 'movie',
          durationSeconds: 5400,
        },
        {
          id: 102,
          title: 'Dune: Part Two',
          resumeMs: 0,
          subtitle: undefined,
          posterUrl: '/api/v1/artwork/102/poster',
          mediaType: 'movie',
          durationSeconds: 4200,
        },
        {
          id: 103,
          title: 'Sci-Fi Live TV',
          resumeMs: 0,
          subtitle: undefined,
          posterUrl: '/api/v1/artwork/103/poster',
          mediaType: 'live_channel',
          durationSeconds: undefined,
        },
      ],
      0
    );

    // 2. Per-item Play from here on 2nd item (index 1)
    onPlayQueue.mockClear();
    fireEvent.click(document.getElementById('playlist-item-play-102')!);
    expect(onPlayQueue).toHaveBeenCalledWith(
      [
        {
          id: 101,
          title: 'Blade Runner 2049',
          resumeMs: 900000,
          subtitle: 'Denis Villeneuve',
          posterUrl: '/api/v1/artwork/101/poster',
          mediaType: 'movie',
          durationSeconds: 5400,
        },
        {
          id: 102,
          title: 'Dune: Part Two',
          resumeMs: 0,
          subtitle: undefined,
          posterUrl: '/api/v1/artwork/102/poster',
          mediaType: 'movie',
          durationSeconds: 4200,
        },
        {
          id: 103,
          title: 'Sci-Fi Live TV',
          resumeMs: 0,
          subtitle: undefined,
          posterUrl: '/api/v1/artwork/103/poster',
          mediaType: 'live_channel',
          durationSeconds: undefined,
        },
      ],
      1
    );

    // 3. Shuffle -> starts at index 0 with Fisher-Yates copy without mutating displayed items
    onPlayQueue.mockClear();
    fireEvent.click(document.getElementById('playlist-shuffle-btn')!);
    expect(onPlayQueue).toHaveBeenCalledTimes(1);
    const [shuffledQueue, startIdx] = onPlayQueue.mock.calls[0];
    expect(startIdx).toBe(0);
    expect(shuffledQueue).toHaveLength(3);
    expect(shuffledQueue.map((i: { id: number }) => i.id).sort()).toEqual([101, 102, 103]);
    // Displayed order in DOM remains unchanged
    const rows = screen.getByTestId('playlist-items-list').children;
    expect(rows[0]).toHaveAttribute('data-testid', 'playlist-item-row-101');
  });

  it('supports Reorder (Move Up/Down), Remove item, Edit metadata, and Delete playlist when is_editable is true, plus rollback on reorder error', async () => {
    const detail = makeEditableDetail();
    vi.spyOn(playlistsApi, 'fetchPlaylistDetail').mockResolvedValue(detail);

    const reorderSpy = vi
      .spyOn(playlistsApi, 'reorderPlaylistItems')
      .mockResolvedValueOnce(detail.summary)
      .mockRejectedValueOnce(new Error('400 INVALID_ORDER'));
    const removeSpy = vi.spyOn(playlistsApi, 'removePlaylistItem').mockResolvedValue({
      ...detail.summary,
      visible_item_count: 2,
    });
    const updateSpy = vi.spyOn(playlistsApi, 'updatePlaylist').mockResolvedValue({
      ...detail.summary,
      name: 'Updated Title',
      is_public: true,
    });
    const deleteSpy = vi.spyOn(playlistsApi, 'deletePlaylist').mockResolvedValue(undefined);

    const onPlaylistChanged = vi.fn();
    const onPlaylistDeleted = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PlaylistDetailModal
          isOpen={true}
          playlistId="pl-detail-1"
          client={client}
          serverUrl="http://localhost:8492"
          onClose={onClose}
          onPlayQueue={vi.fn()}
          onPlaylistChanged={onPlaylistChanged}
          onPlaylistDeleted={onPlaylistDeleted}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Blade Runner 2049')).toBeInTheDocument();
    });

    // Move item 102 UP -> permutation [102, 101, 103]
    await act(async () => {
      fireEvent.click(document.getElementById('playlist-item-up-102')!);
    });
    expect(reorderSpy).toHaveBeenCalledWith(client, 'pl-detail-1', [102, 101, 103]);
    expect(onPlaylistChanged).toHaveBeenCalledTimes(1);

    // Move item 101 DOWN when server rejects -> rolls back to [102, 101, 103]
    await act(async () => {
      fireEvent.click(document.getElementById('playlist-item-down-101')!);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('400 INVALID_ORDER');
    const currentRows = screen.getByTestId('playlist-items-list').children;
    expect(currentRows[0]).toHaveAttribute('data-testid', 'playlist-item-row-102');
    expect(currentRows[1]).toHaveAttribute('data-testid', 'playlist-item-row-101');

    // Remove item 103
    await act(async () => {
      fireEvent.click(document.getElementById('playlist-item-remove-103')!);
    });
    expect(removeSpy).toHaveBeenCalledWith(client, 'pl-detail-1', 103);
    expect(screen.queryByText('Sci-Fi Live TV')).not.toBeInTheDocument();

    // Edit metadata
    fireEvent.click(document.getElementById('playlist-edit-btn')!);
    fireEvent.change(screen.getByLabelText(/Playlist Name/i), {
      target: { value: 'Updated Title' },
    });
    fireEvent.click(document.getElementById('playlist-form-public-toggle')!);
    await act(async () => {
      fireEvent.click(document.getElementById('playlist-form-submit-btn')!);
    });
    expect(updateSpy).toHaveBeenCalledWith(client, 'pl-detail-1', {
      name: 'Updated Title',
      description: 'Three essential films',
      is_public: true,
    });
    expect(screen.getByText('Updated Title')).toBeInTheDocument();

    // Delete playlist with confirmation
    fireEvent.click(document.getElementById('playlist-delete-btn')!);
    expect(screen.getByTestId('playlist-delete-confirm-bar')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(document.getElementById('playlist-confirm-delete-btn')!);
    });
    expect(deleteSpy).toHaveBeenCalledWith(client, 'pl-detail-1');
    expect(onPlaylistDeleted).toHaveBeenCalledWith('pl-detail-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides edit, delete, reorder, and remove controls for read-only shared playlists (is_editable: false)', async () => {
    const readOnlyDetail = makeEditableDetail();
    readOnlyDetail.summary = {
      ...readOnlyDetail.summary,
      is_public: true,
      is_editable: false,
      owner_username: 'other_user',
    };
    vi.spyOn(playlistsApi, 'fetchPlaylistDetail').mockResolvedValue(readOnlyDetail);

    render(
      <FocusProvider>
        <PlaylistDetailModal
          isOpen={true}
          playlistId="pl-detail-1"
          client={client}
          serverUrl="http://localhost:8492"
          onClose={vi.fn()}
          onPlayQueue={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Director Cut Queue')).toBeInTheDocument();
    });

    expect(document.getElementById('playlist-play-all-btn')).not.toBeNull();
    expect(document.getElementById('playlist-shuffle-btn')).not.toBeNull();
    expect(document.getElementById('playlist-edit-btn')).toBeNull();
    expect(document.getElementById('playlist-delete-btn')).toBeNull();
    expect(document.getElementById('playlist-item-up-101')).toBeNull();
    expect(document.getElementById('playlist-item-down-101')).toBeNull();
    expect(document.getElementById('playlist-item-remove-101')).toBeNull();
  });
});
