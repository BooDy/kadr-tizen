import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';
import { AddToPlaylistModal } from '../../src/components/playlists/AddToPlaylistModal';
import { ApiClient } from '../../src/api/client';
import * as playlistsApi from '../../src/api/playlists';
import { PlaylistSummary } from '../../src/api/playlists';

const editableMemberPlaylist: PlaylistSummary = {
  id: 'pl-edit-1',
  name: 'Already Contains Movie',
  owner_user_id: 'user-1',
  owner_username: 'boody',
  is_public: false,
  is_editable: true,
  visible_item_count: 4,
  locked_item_count: 0,
  total_duration_seconds: 7200,
  cover_poster_urls: [],
  created_at: 1730000000,
  updated_at: 1730001000,
  contains_queried_item: true,
};

const editableTargetPlaylist: PlaylistSummary = {
  id: 'pl-edit-2',
  name: 'Weekend Watchlist',
  owner_user_id: 'user-1',
  owner_username: 'boody',
  is_public: true,
  is_editable: true,
  visible_item_count: 1,
  locked_item_count: 0,
  total_duration_seconds: 3600,
  cover_poster_urls: [],
  created_at: 1730000100,
  updated_at: 1730001100,
  contains_queried_item: false,
};

const readOnlySharedPlaylist: PlaylistSummary = {
  id: 'pl-readonly',
  name: 'Read Only Shared',
  owner_user_id: 'user-2',
  owner_username: 'sara',
  is_public: true,
  is_editable: false,
  visible_item_count: 3,
  locked_item_count: 0,
  total_duration_seconds: 5400,
  cover_poster_urls: [],
  created_at: 1730000200,
  updated_at: 1730001200,
};

describe('AddToPlaylistModal', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('jwt-add');
    vi.restoreAllMocks();
  });

  it('queries ?contains_item_id= for single items, shows In Playlist badge, hides read-only playlists, and adds item_ids', async () => {
    const fetchSpy = vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([
      editableMemberPlaylist,
      editableTargetPlaylist,
      readOnlySharedPlaylist,
    ]);
    const addSpy = vi.spyOn(playlistsApi, 'addPlaylistItems').mockResolvedValue({
      added_count: 1,
      skipped_duplicate_count: 0,
      summary: editableTargetPlaylist,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{ kind: 'item', itemId: 42, title: 'Inception' }}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Already Contains Movie')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(client, 42);
    expect(screen.getByTestId('in-playlist-badge-pl-edit-1')).toHaveTextContent('In Playlist');
    expect(screen.queryByTestId('in-playlist-badge-pl-edit-2')).not.toBeInTheDocument();
    // Non-editable playlist is excluded from target list
    expect(screen.queryByText('Read Only Shared')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-to-playlist-option-pl-edit-2'));
    });

    expect(addSpy).toHaveBeenCalledWith(client, 'pl-edit-2', {
      item_ids: [42],
    });
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: 'pl-edit-2',
        playlistName: 'Weekend Watchlist',
        addedCount: 1,
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports adding Whole Show or specific Season for TV show targets', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([editableTargetPlaylist]);
    const addSpy = vi.spyOn(playlistsApi, 'addPlaylistItems').mockResolvedValue({
      added_count: 9,
      skipped_duplicate_count: 0,
      summary: editableTargetPlaylist,
    });

    const { unmount } = render(
      <FocusProvider>
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{
            kind: 'show',
            showId: 205,
            title: 'Severance',
            seasons: [1, 2],
            defaultSeason: 1,
          }}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Weekend Watchlist')).toBeInTheDocument();
    });

    // Default scope is Whole Show -> { show: { show_id: 205 } }
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-to-playlist-option-pl-edit-2'));
    });
    expect(addSpy).toHaveBeenCalledWith(client, 'pl-edit-2', {
      show: { show_id: 205 },
    });

    unmount();
    addSpy.mockClear();

    render(
      <FocusProvider>
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{
            kind: 'show',
            showId: 205,
            title: 'Severance',
            seasons: [1, 2],
          }}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Weekend Watchlist')).toBeInTheDocument();
    });

    // Switch scope to Season 2 -> { show: { show_id: 205, season_number: 2 } }
    fireEvent.click(document.getElementById('add-playlist-scope-season-2')!);
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-to-playlist-option-pl-edit-2'));
    });
    expect(addSpy).toHaveBeenCalledWith(client, 'pl-edit-2', {
      show: { show_id: 205, season_number: 2 },
    });
  });

  it('supports Folder target with recursive subfolder toggle and 1-step atomic Create & Add (ignoring Backspace in input)', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([]);
    const createSpy = vi.spyOn(playlistsApi, 'createPlaylist').mockResolvedValue({
      summary: {
        ...editableTargetPlaylist,
        id: 'pl-atomic-1',
        name: 'Sci-Fi Vault',
        is_public: true,
        visible_item_count: 12,
      },
      items: [],
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <FocusProvider>
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{
            kind: 'folder',
            libraryId: 'lib-movies',
            path: 'Sci-Fi/Dune',
            folderName: 'Dune',
          }}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-and-add-form')).toBeInTheDocument();
    });

    // Toggle Include Subfolders ON
    const recursiveBtn = document.getElementById('add-playlist-recursive-toggle')!;
    expect(recursiveBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(recursiveBtn);
    expect(recursiveBtn).toHaveAttribute('aria-pressed', 'true');

    const nameInput = screen.getByLabelText(/New Playlist Name/i);
    fireEvent.change(nameInput, { target: { value: 'Sci-Fi Vault' } });

    // Backspace inside input must NOT close modal
    fireEvent.keyDown(nameInput, { key: 'Backspace', keyCode: 8 });
    expect(onClose).not.toHaveBeenCalled();

    // Toggle public ON
    fireEvent.click(document.getElementById('add-playlist-new-public-toggle')!);

    await act(async () => {
      fireEvent.click(document.getElementById('add-playlist-create-submit-btn')!);
    });

    expect(createSpy).toHaveBeenCalledWith(client, {
      name: 'Sci-Fi Vault',
      description: undefined,
      is_public: true,
      items: {
        folder: {
          library_id: 'lib-movies',
          path: 'Sci-Fi/Dune',
          recursive: true,
        },
      },
    });
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: 'pl-atomic-1',
        playlistName: 'Sci-Fi Vault',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onLockedLibrary when folder expansion returns 403 LIBRARY_LOCKED', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([editableTargetPlaylist]);
    vi.spyOn(playlistsApi, 'addPlaylistItems').mockRejectedValue(
      new Error('HTTP 403: LIBRARY_LOCKED')
    );
    const onLockedLibrary = vi.fn();

    render(
      <FocusProvider>
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{
            kind: 'folder',
            libraryId: 'lib-locked-1',
            path: 'PrivateDir',
            folderName: 'PrivateDir',
          }}
          onClose={vi.fn()}
          onLockedLibrary={onLockedLibrary}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Weekend Watchlist')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-to-playlist-option-pl-edit-2'));
    });

    expect(onLockedLibrary).toHaveBeenCalledWith('lib-locked-1');
    expect(screen.getByRole('alert')).toHaveTextContent('LIBRARY_LOCKED');
  });

  it('supports D-pad navigation onto New Playlist Name input and Tizen IME activation in 1920x1080 real geometry', async () => {
    function makeRect(x: number, y: number, width: number, height: number): DOMRect {
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => {},
      };
    }

    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([editableTargetPlaylist]);
    const createSpy = vi.spyOn(playlistsApi, 'createPlaylist').mockResolvedValue({
      summary: {
        ...editableTargetPlaylist,
        id: 'pl-remote-new',
        name: 'TV Created List',
        is_public: false,
      },
      items: [],
    });
    const onClose = vi.fn();

    function FocusProbe() {
      const { focusedId } = useFocusContext();
      return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
    }

    render(
      <FocusProvider>
        <FocusProbe />
        <AddToPlaylistModal
          isOpen={true}
          client={client}
          serverUrl="http://localhost:8492"
          target={{ kind: 'item', itemId: 77, title: 'Arrival' }}
          onClose={onClose}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Weekend Watchlist')).toBeInTheDocument();
    });

    const closeBtn = document.getElementById('add-playlist-close-btn')!;
    const optBtn = screen.getByTestId('add-to-playlist-option-pl-edit-2');
    const toggleCreateBtn = document.getElementById('add-playlist-toggle-create-btn')!;

    vi.spyOn(optBtn, 'getBoundingClientRect').mockReturnValue(makeRect(600, 310, 720, 84));
    vi.spyOn(toggleCreateBtn, 'getBoundingClientRect').mockReturnValue(makeRect(600, 430, 260, 52));
    vi.spyOn(closeBtn, 'getBoundingClientRect').mockReturnValue(makeRect(1170, 820, 150, 50));

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('add-to-playlist-option-pl-edit-2');
    });

    // Navigate Down to "Create New Playlist & Add" and press Enter to expand inline form
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('add-playlist-toggle-create-btn');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    const nameInput = (await screen.findByLabelText(/New Playlist Name/i)) as HTMLInputElement;
    const descInput = document.getElementById('add-playlist-new-desc-input') as HTMLInputElement;
    const pubBtn = document.getElementById('add-playlist-new-public-toggle')!;
    const submitCreateBtn = document.getElementById('add-playlist-create-submit-btn')!;

    vi.spyOn(nameInput, 'getBoundingClientRect').mockReturnValue(makeRect(620, 500, 680, 54));
    vi.spyOn(descInput, 'getBoundingClientRect').mockReturnValue(makeRect(620, 590, 680, 54));
    // Public toggle and Create & Add sit side-by-side on the same row (y=670)
    vi.spyOn(pubBtn, 'getBoundingClientRect').mockReturnValue(makeRect(620, 670, 180, 48));
    vi.spyOn(submitCreateBtn, 'getBoundingClientRect').mockReturnValue(makeRect(1106, 670, 194, 48));

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('add-playlist-new-name-input');
    });

    // Press Enter to activate Samsung Tizen keyboard on nameInput (must NOT submit empty form)
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(nameInput);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'TV Created List' } });

    // Press Tizen Return (10009) to dismiss keyboard -> blurs input without closing modal
    act(() => {
      fireEvent.keyDown(nameInput, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.activeElement).not.toBe(nameInput);
    expect(onClose).not.toHaveBeenCalled();

    // Navigate Down through Description -> Public toggle -> Right to Create & Add button
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('add-playlist-new-desc-input');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('add-playlist-new-public-toggle');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('add-playlist-create-submit-btn');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    expect(createSpy).toHaveBeenCalledWith(client, {
      name: 'TV Created List',
      description: undefined,
      is_public: false,
      items: { item_ids: [77] },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
