import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';
import { PlaylistsView } from '../../src/screens/PlaylistsView';
import { ApiClient } from '../../src/api/client';
import * as playlistsApi from '../../src/api/playlists';
import { PlaylistSummary, PlaylistDetail } from '../../src/api/playlists';

const myMosaicPlaylist: PlaylistSummary = {
  id: 'pl-my-mosaic',
  name: 'Four Poster Mosaic',
  description: 'Epic 4-film marathon',
  owner_user_id: 'user-me',
  owner_username: 'boody',
  is_public: false,
  is_editable: true,
  visible_item_count: 5,
  locked_item_count: 2,
  total_duration_seconds: 9540, // 2h 39m
  cover_poster_urls: [
    '/api/v1/artwork/1/poster',
    '/api/v1/artwork/2/poster',
    '/api/v1/artwork/3/poster',
    '/api/v1/artwork/4/poster',
  ],
  created_at: 1730000000,
  updated_at: 1730001000,
};

const myEmptyPlaylist: PlaylistSummary = {
  id: 'pl-my-empty',
  name: 'Empty Watchlist',
  owner_user_id: 'user-me',
  owner_username: 'boody',
  is_public: true,
  is_editable: true,
  visible_item_count: 0,
  locked_item_count: 0,
  total_duration_seconds: 0,
  cover_poster_urls: [],
  created_at: 1730000500,
  updated_at: 1730001500,
};

const sharedSingleCoverPlaylist: PlaylistSummary = {
  id: 'pl-shared-1',
  name: 'Family Favorites',
  description: 'Shared by Sara',
  owner_user_id: 'user-sara',
  owner_username: 'sara',
  is_public: true,
  is_editable: false,
  visible_item_count: 2,
  locked_item_count: 0,
  total_duration_seconds: 5400, // 1h 30m
  cover_poster_urls: ['/api/v1/artwork/10/poster', '/api/v1/artwork/11/poster'],
  created_at: 1730000200,
  updated_at: 1730001200,
};

describe('PlaylistsView & PlaylistCoverMosaic', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('jwt-abc');
    client.setLibraryUnlockToken('lib-private', 'unlock-tok-99');
    vi.restoreAllMocks();
  });

  it('splits My Playlists and Shared on Server and renders 2x2 mosaic, single poster, placeholder, badges, and authenticated URLs', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([
      myMosaicPlaylist,
      myEmptyPlaylist,
      sharedSingleCoverPlaylist,
    ]);
    const onOpenPlaylist = vi.fn();

    render(
      <FocusProvider>
        <PlaylistsView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-abc"
          currentUserId="user-me"
          onOpenPlaylist={onOpenPlaylist}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Four Poster Mosaic')).toBeInTheDocument();
    });

    const mySection = screen.getByTestId('my-playlists-section');
    const sharedSection = screen.getByTestId('shared-playlists-section');

    expect(within(mySection).getByText('Four Poster Mosaic')).toBeInTheDocument();
    expect(within(mySection).getByText('Empty Watchlist')).toBeInTheDocument();
    expect(within(mySection).queryByText('Family Favorites')).not.toBeInTheDocument();

    expect(within(sharedSection).getByText('Family Favorites')).toBeInTheDocument();
    expect(within(sharedSection).getByText('sara')).toBeInTheDocument();

    // 1. >= 4 cover URLs -> 2x2 mosaic with authenticated ?token=...&unlocked=... URLs
    const mosaicCard = screen.getByTestId('playlist-card-pl-my-mosaic');
    const mosaicGrid = within(mosaicCard).getByTestId('playlist-cover-mosaic-grid');
    const mosaicImgs = mosaicGrid.querySelectorAll('img');
    expect(mosaicImgs).toHaveLength(4);
    expect(mosaicImgs[0].getAttribute('src')).toBe(
      'http://localhost:8492/api/v1/artwork/1/poster?token=jwt-abc&unlocked=unlock-tok-99'
    );
    expect(within(mosaicCard).getByTestId('playlist-locked-badge')).toHaveTextContent('+2 locked');
    expect(within(mosaicCard).getByTestId('playlist-visibility-badge')).toHaveTextContent('Private');
    expect(within(mosaicCard).getByText(/5 items/i)).toBeInTheDocument();
    expect(within(mosaicCard).getByText('2h 39m')).toBeInTheDocument();

    // 2. 0 cover URLs -> placeholder icon
    const emptyCard = screen.getByTestId('playlist-card-pl-my-empty');
    expect(within(emptyCard).getByTestId('playlist-cover-placeholder')).toBeInTheDocument();
    expect(within(emptyCard).getByTestId('playlist-visibility-badge')).toHaveTextContent('Public');

    // 3. 1..3 cover URLs -> single cover image
    const sharedCard = screen.getByTestId('playlist-card-pl-shared-1');
    const singleImg = within(sharedCard).getByTestId('playlist-cover-single');
    expect(singleImg.getAttribute('src')).toBe(
      'http://localhost:8492/api/v1/artwork/10/poster?token=jwt-abc&unlocked=unlock-tok-99'
    );
    expect(within(sharedCard).getByText('1h 30m')).toBeInTheDocument();

    // Clicking a card invokes onOpenPlaylist
    fireEvent.click(mosaicCard);
    expect(onOpenPlaylist).toHaveBeenCalledWith('pl-my-mosaic');
  });

  it('creates a new playlist via Create Playlist modal and opens it', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([]);
    const newDetail: PlaylistDetail = {
      summary: {
        ...myEmptyPlaylist,
        id: 'pl-created-1',
        name: 'Late Night Horror',
        description: 'Spooky picks',
        is_public: true,
      },
      items: [],
    };
    const createSpy = vi.spyOn(playlistsApi, 'createPlaylist').mockResolvedValue(newDetail);
    const onOpenPlaylist = vi.fn();

    render(
      <FocusProvider>
        <PlaylistsView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-abc"
          currentUserId="user-me"
          onOpenPlaylist={onOpenPlaylist}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/You haven't created any playlists yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Playlist/i }));

    const dialog = screen.getByRole('dialog', { name: /Create Playlist/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.change(screen.getByLabelText(/Playlist Name/i), {
      target: { value: 'Late Night Horror' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Spooky picks' },
    });
    fireEvent.click(document.getElementById('playlist-form-public-toggle')!);

    await act(async () => {
      fireEvent.click(document.getElementById('playlist-form-submit-btn')!);
    });

    expect(createSpy).toHaveBeenCalledWith(client, {
      name: 'Late Night Horror',
      description: 'Spooky picks',
      is_public: true,
    });
    expect(onOpenPlaylist).toHaveBeenCalledWith('pl-created-1');
  });

  it('swallows unmocked or failing fetchPlaylists calls gracefully without crashing', async () => {
    vi.spyOn(playlistsApi, 'fetchPlaylists').mockRejectedValue(new Error('Unmocked endpoint'));

    render(
      <FocusProvider>
        <PlaylistsView
          client={client}
          serverUrl="http://localhost:8492"
          onOpenPlaylist={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/You haven't created any playlists yet/i)).toBeInTheDocument();
    });
  });

  it('creates a playlist end-to-end using ONLY TV remote D-pad, Enter, and Tizen IME keys with 1920x1080 real rects', async () => {
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

    vi.spyOn(playlistsApi, 'fetchPlaylists').mockResolvedValue([]);
    const createdDetail: PlaylistDetail = {
      summary: {
        ...myEmptyPlaylist,
        id: 'pl-remote-created',
        name: 'Tizen Remote Queue',
        description: 'Typed with TV IME',
        is_public: true,
      },
      items: [],
    };
    const createSpy = vi.spyOn(playlistsApi, 'createPlaylist').mockResolvedValue(createdDetail);
    const onOpenPlaylist = vi.fn();

    function FocusProbe() {
      const { focusedId } = useFocusContext();
      return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
    }

    render(
      <FocusProvider>
        <FocusProbe />
        <PlaylistsView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-abc"
          currentUserId="user-me"
          onOpenPlaylist={onOpenPlaylist}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('playlists-create-btn');
    });

    // Press Enter on Create Playlist button via remote
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    const dialog = await screen.findByRole('dialog', { name: /Create Playlist/i });
    expect(dialog).toBeInTheDocument();

    // Mock real 1920x1080 modal rects (centered 672px panel: x=624..1296)
    const nameInput = document.getElementById('playlist-form-name-input') as HTMLInputElement;
    const descInput = document.getElementById('playlist-form-desc-input') as HTMLTextAreaElement;
    const publicToggle = document.getElementById('playlist-form-public-toggle')!;
    const cancelBtn = document.getElementById('playlist-form-cancel-btn')!;
    const submitBtn = document.getElementById('playlist-form-submit-btn')!;

    vi.spyOn(nameInput, 'getBoundingClientRect').mockReturnValue(makeRect(636, 320, 648, 56));
    vi.spyOn(descInput, 'getBoundingClientRect').mockReturnValue(makeRect(636, 430, 648, 96));
    vi.spyOn(publicToggle, 'getBoundingClientRect').mockReturnValue(makeRect(636, 566, 180, 48));
    vi.spyOn(cancelBtn, 'getBoundingClientRect').mockReturnValue(makeRect(960, 660, 130, 52));
    vi.spyOn(submitBtn, 'getBoundingClientRect').mockReturnValue(makeRect(1106, 660, 178, 52));

    // Modal starts D-pad focus on Name input
    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-name-input');
    });

    // Traverse Down through Description -> narrow Public toggle -> back Up to prove real 1080p geometry selects wide inputs
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-desc-input');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-public-toggle');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-desc-input');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-name-input');

    // Press Enter (OK) to focus native <input> and open Samsung Tizen virtual keyboard
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(nameInput);
    // Must NOT have triggered empty-name form submit validation error on Enter!
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Tizen Remote Queue' } });

    // Dismiss Tizen keyboard with Return (10009): blurs <input> WITHOUT closing the modal!
    act(() => {
      fireEvent.keyDown(nameInput, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.activeElement).not.toBe(nameInput);
    expect(screen.getByRole('dialog', { name: /Create Playlist/i })).toBeInTheDocument();

    // Navigate Down to Description -> Enter to focus <textarea> -> type -> IME_DONE (65376)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-desc-input');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(descInput);
    fireEvent.change(descInput, { target: { value: 'Typed with TV IME' } });

    act(() => {
      fireEvent.keyDown(descInput, { keyCode: TVKeys.IME_DONE });
    });
    expect(document.activeElement).not.toBe(descInput);

    // Navigate Down to Public toggle -> press Enter to toggle Public ON
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-public-toggle');
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(publicToggle).toHaveAttribute('aria-pressed', 'true');

    // Navigate Down + Right to Create Playlist submit button -> press Enter to submit
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    if (screen.getByTestId('probe-focus').textContent === 'playlist-form-cancel-btn') {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('playlist-form-submit-btn');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    expect(createSpy).toHaveBeenCalledWith(client, {
      name: 'Tizen Remote Queue',
      description: 'Typed with TV IME',
      is_public: true,
    });
    expect(onOpenPlaylist).toHaveBeenCalledWith('pl-remote-created');
  });
});
